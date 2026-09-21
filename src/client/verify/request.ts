/**
 * Building the verification request.
 *
 * Only model-drafted cards are ever submitted: a card that already fell back to
 * reviewed catalog prose has nothing to verify. Text is sanitized here — control
 * characters and runs of whitespace collapsed, length capped to the contract —
 * and any item whose text still looks like an identifier or a link is dropped
 * rather than sent. The evaluation token travels exactly as it was issued.
 */

import {
  SCHEMA_VERSION,
  LIMITS,
  verifyRequestSchema,
  type VerifyRequest,
} from "@/shared/contracts";
import { containsIdentifier } from "@/client/extraction/validate";
import type { ComposedCard } from "@/client/compose";
import type { DraftItem } from "@/client/compose";

export type VerifyRequestBuild =
  | { ok: true; request: VerifyRequest; submittedProgramIds: string[] }
  | { ok: false; reason: "nothing_to_verify" | "invalid_request" };

/** Collapse whitespace, strip control characters and cap to the contract. */
export function sanitizeDraftText(text: string): string {
  return (
    text
      // Stripping control characters is exactly the point of this step.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, LIMITS.maxSentenceChars)
  );
}

function sanitizeItems(items: readonly DraftItem[]): DraftItem[] {
  const out: DraftItem[] = [];
  for (const item of items) {
    const text = sanitizeDraftText(item.text);
    // Belt and braces: composition already rejects these, and nothing that
    // looks like a link or an identifier is allowed to reach the network.
    if (text.length === 0 || containsIdentifier(text)) continue;
    out.push({ id: item.id, text, evidenceIds: [...item.evidenceIds] });
  }
  return out;
}

export function buildVerifyRequest(
  cards: readonly ComposedCard[],
  context: { revision: number; catalogVersion: string; evaluationToken: string },
): VerifyRequestBuild {
  const drafts: VerifyRequest["drafts"] = [];

  for (const card of cards) {
    if (card.source !== "model") continue;
    const sentences = sanitizeItems(card.draft.sentences);
    const checklist = sanitizeItems(card.draft.checklist);
    if (sentences.length === 0 && checklist.length === 0) continue;
    drafts.push({
      programId: card.programId as VerifyRequest["drafts"][number]["programId"],
      sentences: sentences.slice(0, LIMITS.maxSentencesPerProgram),
      checklist: checklist.slice(0, LIMITS.maxChecklistPerProgram),
    });
  }

  if (drafts.length === 0) return { ok: false, reason: "nothing_to_verify" };

  const candidate = {
    schemaVersion: SCHEMA_VERSION,
    revision: context.revision,
    catalogVersion: context.catalogVersion,
    evaluationToken: context.evaluationToken,
    drafts: drafts.slice(0, LIMITS.maxPrograms),
  };

  const parsed = verifyRequestSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, reason: "invalid_request" };

  return {
    ok: true,
    request: parsed.data,
    submittedProgramIds: parsed.data.drafts.map((d) => d.programId),
  };
}
