/**
 * Bounded draft generation.
 *
 * One fresh session per card, destroyed as soon as the card is done: the
 * explanation context is created from the snapshot alone, so an intake session
 * or its history cannot contaminate it. At most two cards are generated at a
 * time, each card has its own time budget, and the whole batch has one — a slow
 * program never blocks the page, it just falls back to reviewed prose.
 */

import type { LocalModelAdapter, LocalModelSession } from "@/client/adapters/nano";
import {
  buildComposePrompt,
  COMPOSE_BUDGET,
  COMPOSE_PROMPT_VERSION,
  draftJsonSchema,
} from "./prompts";
import {
  curatedCard,
  parseDraft,
  type CuratedCard,
  type DraftFailure,
  type ProgramDraft,
} from "./validate";
import type { EvidenceSnapshot } from "./snapshot";

export type ComposedCard =
  | { programId: string; source: "model"; draft: ProgramDraft; curated: CuratedCard | null }
  | { programId: string; source: "curated"; failure: DraftFailure; curated: CuratedCard | null };

export type ComposeRun = {
  promptVersion: string;
  cards: ComposedCard[];
  /** True when the whole-batch budget ran out before every card was tried. */
  budgetExhausted: boolean;
};

export type ComposeOptions = {
  perProgramMs?: number;
  totalMs?: number;
  concurrency?: number;
  signal?: AbortSignal;
  now?: () => number;
};

/** A session factory so tests can drive generation without a browser model. */
export type ExplanationSessionFactory = (signal: AbortSignal) => Promise<LocalModelSession>;

export function sessionFactoryFrom(adapter: LocalModelAdapter): ExplanationSessionFactory {
  return (signal) =>
    adapter.createSession({ purpose: "explanation", requestedByUser: true, signal });
}

function failureFrom(error: unknown): DraftFailure {
  const code = (error as { code?: string } | null)?.code;
  if (code === "local_cancelled") return "cancelled";
  const name = (error as { name?: string } | null)?.name;
  if (name === "AbortError") return "cancelled";
  return "session_failed";
}

function curatedResult(programId: string, failure: DraftFailure): ComposedCard {
  return { programId, source: "curated", failure, curated: curatedCard(programId) };
}

async function composeOne(
  snapshot: EvidenceSnapshot,
  factory: ExplanationSessionFactory,
  perProgramMs: number,
  outerSignal: AbortSignal | undefined,
): Promise<ComposedCard> {
  if (outerSignal?.aborted) return curatedResult(snapshot.programId, "cancelled");

  // A session created for one card is never reused for another, and never for
  // extraction: that is what keeps the narrative out of this context.
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  outerSignal?.addEventListener("abort", onAbort, { once: true });

  // The deadline is enforced here as well as through the signal: a session that
  // ignores cancellation must still not be able to hold the page open.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("compose_timed_out"));
    }, perProgramMs);
  });

  let session: LocalModelSession | null = null;
  try {
    session = await Promise.race([factory(controller.signal), deadline]);
    const raw = await Promise.race([
      session.prompt(buildComposePrompt(snapshot), {
        schema: draftJsonSchema(snapshot),
        signal: controller.signal,
      }),
      deadline,
    ]);
    const parsed = parseDraft(raw, snapshot);
    if (!parsed.ok) return curatedResult(snapshot.programId, parsed.failure);
    return {
      programId: snapshot.programId,
      source: "model",
      draft: parsed.draft,
      curated: curatedCard(snapshot.programId),
    };
  } catch (error) {
    const failure =
      controller.signal.aborted && !outerSignal?.aborted ? "timed_out" : failureFrom(error);
    return curatedResult(snapshot.programId, failure);
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener("abort", onAbort);
    session?.destroy();
  }
}

/**
 * Generate drafts for the given snapshots. Always resolves with one card per
 * snapshot, in the order given: a card that could not be drafted carries its
 * curated text and the reason, so the caller never has to handle a gap.
 */
export async function composeDrafts(
  snapshots: EvidenceSnapshot[],
  factory: ExplanationSessionFactory,
  options: ComposeOptions = {},
): Promise<ComposeRun> {
  const perProgramMs = options.perProgramMs ?? COMPOSE_BUDGET.perProgramMs;
  const totalMs = options.totalMs ?? COMPOSE_BUDGET.totalMs;
  const concurrency = Math.max(1, options.concurrency ?? COMPOSE_BUDGET.concurrency);
  const now = options.now ?? (() => Date.now());
  const startedAt = now();

  const cards: (ComposedCard | undefined)[] = new Array(snapshots.length);
  let budgetExhausted = false;
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= snapshots.length) return;
      const snapshot = snapshots[index]!;
      if (now() - startedAt >= totalMs) {
        budgetExhausted = true;
        cards[index] = curatedResult(snapshot.programId, "timed_out");
        continue;
      }
      const remaining = totalMs - (now() - startedAt);
      cards[index] = await composeOne(
        snapshot,
        factory,
        Math.min(perProgramMs, remaining),
        options.signal,
      );
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(snapshots.length, 1)) }, worker),
  );

  return {
    promptVersion: COMPOSE_PROMPT_VERSION,
    cards: cards.map(
      (card, index) => card ?? curatedResult(snapshots[index]!.programId, "session_failed"),
    ),
    budgetExhausted,
  };
}
