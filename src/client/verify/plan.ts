/**
 * The approved plan assembler.
 *
 * This is the only place a plan card is built, and it is the gate: generated
 * prose exists in a card ONLY when the server approved that exact item ID for
 * that exact program. Everything else — a card the server sent back as
 * `fallback`, a card that was never submitted, a card whose approval never
 * arrived because verification was unavailable — carries reviewed catalog prose
 * instead. A caller therefore cannot render or speak an unapproved sentence: it
 * is not in the structure at all.
 *
 * Official figures and links are chosen here from the catalog, never from a
 * draft, so what a person acts on is always the curated value.
 */

import { programById, type ProgramId } from "@/shared/catalog";
import type { VerifyResponse } from "@/shared/contracts";
import type { ComposedCard, DraftItem } from "@/client/compose";

/** How the prose on a card came to be shown. */
export type ContentApprovalMode = "verified" | "curated";

export type PlanChecklistItem = {
  id: string;
  /** Approved drafted wording, or the curated label. */
  text: string;
};

export type PlanCard = {
  programId: string;
  programName: string;
  approvalMode: ContentApprovalMode;
  /** Present only for approved drafted prose. */
  sentences: string[];
  /** Curated prose, used whenever `approvalMode` is "curated". */
  explanation: string | null;
  checklist: PlanChecklistItem[];
  /** Code-selected from the catalog; a model never supplies these. */
  officialValue: string;
  links: { id: string; label: string; url: string }[];
  /** Closed codes for why a card fell back; safe to log, not prose. */
  reasonCodes: string[];
};

export type Plan = {
  revision: number;
  /** "jev" only when a real verification answered; otherwise "rules". */
  engine: "jev" | "rules";
  model: string | null;
  cards: PlanCard[];
  approvedCount: number;
  fallbackCount: number;
};

function curatedChecklistFor(programId: string): PlanChecklistItem[] {
  const program = programById(programId as ProgramId);
  if (!program) return [];
  const byId = new Map<string, string>();
  for (const doc of program.documents) byId.set(doc.id, doc.label);
  for (const app of program.application) byId.set(app.id, app.label);
  const items: PlanChecklistItem[] = [];
  for (const id of program.fallbackChecklistIds) {
    const label = byId.get(id);
    if (label) items.push({ id, text: label });
  }
  return items;
}

function officialsFor(programId: string): {
  programName: string;
  officialValue: string;
  links: PlanCard["links"];
} {
  const program = programById(programId as ProgramId);
  if (!program) return { programName: programId, officialValue: "", links: [] };
  return {
    programName: program.name,
    officialValue: program.value.text,
    links: program.application.map((app) => ({ id: app.id, label: app.label, url: app.url })),
  };
}

function curatedCardFrom(programId: string, reasonCodes: string[]): PlanCard {
  const officials = officialsFor(programId);
  const program = programById(programId as ProgramId);
  return {
    programId,
    approvalMode: "curated",
    sentences: [],
    explanation: program ? program.fallbackExplanation : null,
    checklist: curatedChecklistFor(programId),
    reasonCodes,
    ...officials,
  };
}

function approvedItems(items: readonly DraftItem[], approvedIds: readonly string[]): DraftItem[] {
  const allowed = new Set(approvedIds);
  return items.filter((item) => allowed.has(item.id));
}

export type AssembleOptions = {
  /** Present when a batched verification answered; absent means none did. */
  verification?: VerifyResponse;
  /** Used when verification never ran or failed, so cards still render. */
  revision: number;
  /** Closed code recorded on every unverified card. */
  unverifiedReason?: string;
};

/**
 * Assemble the plan. Always returns one card per composed card, in the order
 * given: a failure in one program never removes another program's approved card.
 */
export function assemblePlan(cards: readonly ComposedCard[], options: AssembleOptions): Plan {
  const verification = options.verification;
  const byProgram = new Map(verification ? verification.programs.map((p) => [p.programId, p]) : []);

  const assembled = cards.map((card) => {
    if (card.source !== "model") {
      return curatedCardFrom(card.programId, [`compose.${card.failure}`]);
    }

    const verdict = byProgram.get(card.programId as ProgramId);
    if (!verdict) {
      return curatedCardFrom(card.programId, [options.unverifiedReason ?? "verify.not_verified"]);
    }
    if (verdict.status !== "approved") {
      return curatedCardFrom(card.programId, [...verdict.reasonCodes]);
    }

    const sentences = approvedItems(card.draft.sentences, verdict.approvedSentenceIds);
    const checklist = approvedItems(card.draft.checklist, verdict.approvedChecklistIds);

    // An "approved" card with nothing approved has no verified prose to show.
    if (sentences.length === 0) {
      return curatedCardFrom(card.programId, ["verify.no_approved_sentences"]);
    }

    return {
      programId: card.programId,
      approvalMode: "verified" as const,
      sentences: sentences.map((item) => item.text),
      explanation: null,
      checklist: checklist.map((item) => ({ id: item.id, text: item.text })),
      reasonCodes: [],
      ...officialsFor(card.programId),
    };
  });

  return {
    revision: verification ? verification.revision : options.revision,
    engine: verification ? verification.engine : "rules",
    model: verification ? verification.model : null,
    cards: assembled,
    approvedCount: assembled.filter((card) => card.approvalMode === "verified").length,
    fallbackCount: assembled.filter((card) => card.approvalMode === "curated").length,
  };
}

/** Every string a card is allowed to render or speak. Used by display guards. */
export function displayableText(card: PlanCard): string[] {
  return [
    ...card.sentences,
    ...(card.explanation === null ? [] : [card.explanation]),
    ...card.checklist.map((item) => item.text),
  ];
}
