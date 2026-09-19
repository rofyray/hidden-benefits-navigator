/**
 * Draft validation and curated fallback.
 *
 * Every draft element must cite evidence the snapshot actually contains, use a
 * curated checklist id, stay within the shared contract bounds, and be free of
 * URLs and identifier-shaped text. A draft that fails any of those checks is
 * discarded whole and the card falls back to reviewed catalog prose — a partly
 * valid draft is never patched up, because the invalid part is exactly the part
 * that was not grounded.
 */

import { programById } from "@/shared/catalog";
import { LIMITS } from "@/shared/contracts";
import { containsIdentifier } from "@/client/extraction/validate";
import type { EvidenceSnapshot } from "./snapshot";

export type DraftItem = { id: string; text: string; evidenceIds: string[] };

export type ProgramDraft = {
  programId: string;
  sentences: DraftItem[];
  checklist: DraftItem[];
};

export type DraftFailure =
  | "not_json"
  | "shape_invalid"
  | "too_many_sentences"
  | "too_many_checklist"
  | "sentence_too_long"
  | "unknown_evidence_id"
  | "missing_evidence"
  | "unknown_checklist_id"
  | "duplicate_id"
  | "identifier_present"
  | "empty"
  | "timed_out"
  | "session_failed"
  | "cancelled";

export type DraftResult = { ok: true; draft: ProgramDraft } | { ok: false; failure: DraftFailure };

/** The reviewed card used whenever a draft is unavailable or rejected. */
export type CuratedCard = {
  programId: string;
  explanation: string;
  checklist: { id: string; label: string }[];
};

export function curatedCard(programId: string): CuratedCard | null {
  const program = programById(programId);
  if (!program) return null;
  const byId = new Map<string, string>();
  for (const doc of program.documents) byId.set(doc.id, doc.label);
  for (const app of program.application) byId.set(app.id, app.label);
  const checklist = program.fallbackChecklistIds
    .map((id) => {
      const label = byId.get(id);
      return label ? { id, label } : null;
    })
    .filter((entry): entry is { id: string; label: string } => entry !== null);
  return { programId, explanation: program.fallbackExplanation, checklist };
}

function isItemShape(value: unknown): value is DraftItem {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj["id"] !== "string" || obj["id"].length === 0) return false;
  if (typeof obj["text"] !== "string" || obj["text"].length === 0) return false;
  const ids = obj["evidenceIds"];
  if (!Array.isArray(ids) || ids.length === 0) return false;
  return ids.every((id) => typeof id === "string" && id.length > 0);
}

function checkItems(
  items: DraftItem[],
  snapshot: EvidenceSnapshot,
  allowedIds: string[] | null,
): DraftFailure | null {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) return "duplicate_id";
    seen.add(item.id);
    if (item.id.length > 64) return "shape_invalid";
    if (item.text.length > LIMITS.maxSentenceChars) return "sentence_too_long";
    if (containsIdentifier(item.text)) return "identifier_present";
    if (allowedIds && !allowedIds.includes(item.id)) return "unknown_checklist_id";
    if (item.evidenceIds.length > 10) return "shape_invalid";
    if (new Set(item.evidenceIds).size !== item.evidenceIds.length) return "duplicate_id";
    for (const id of item.evidenceIds) {
      if (!snapshot.allowedEvidenceIds.includes(id)) return "unknown_evidence_id";
    }
  }
  return null;
}

/**
 * Parse and check one raw model answer against its snapshot. An answer with
 * empty arrays is reported as `empty`, which is a legitimate model response
 * meaning "the evidence does not support saying more" — the caller uses the
 * curated card for it, exactly as for a rejected draft.
 */
export function parseDraft(raw: string, snapshot: EvidenceSnapshot): DraftResult {
  if (containsIdentifier(raw)) return { ok: false, failure: "identifier_present" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, failure: "not_json" };
  }
  if (typeof parsed !== "object" || parsed === null) return { ok: false, failure: "shape_invalid" };

  const obj = parsed as Record<string, unknown>;
  const rawSentences = obj["sentences"];
  const rawChecklist = obj["checklist"];
  if (!Array.isArray(rawSentences) || !Array.isArray(rawChecklist))
    return { ok: false, failure: "shape_invalid" };
  if (!rawSentences.every(isItemShape) || !rawChecklist.every(isItemShape))
    return { ok: false, failure: "shape_invalid" };

  const sentences = rawSentences as DraftItem[];
  const checklist = rawChecklist as DraftItem[];
  if (sentences.length === 0 && checklist.length === 0) return { ok: false, failure: "empty" };
  if (sentences.length > LIMITS.maxSentencesPerProgram)
    return { ok: false, failure: "too_many_sentences" };
  if (checklist.length > LIMITS.maxChecklistPerProgram)
    return { ok: false, failure: "too_many_checklist" };

  const sentenceFailure = checkItems(sentences, snapshot, null);
  if (sentenceFailure) return { ok: false, failure: sentenceFailure };
  const checklistFailure = checkItems(checklist, snapshot, snapshot.allowedChecklistIds);
  if (checklistFailure) return { ok: false, failure: checklistFailure };

  return {
    ok: true,
    draft: {
      programId: snapshot.programId,
      sentences: sentences.map((item) => ({
        id: item.id,
        text: item.text,
        evidenceIds: [...item.evidenceIds],
      })),
      checklist: checklist.map((item) => ({
        id: item.id,
        text: item.text,
        evidenceIds: [...item.evidenceIds],
      })),
    },
  };
}
