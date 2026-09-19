/**
 * Per-card evidence snapshots.
 *
 * A snapshot is the ONLY thing the explanation model ever sees for a program.
 * It is assembled here, by code, from the catalog and from the server's
 * screening result — never from the person's narrative, their review state, or
 * an extraction session. Exact amounts, free text the person typed, source
 * spans and program links are not part of it: the link and the official value
 * are rendered by the app from the catalog, not written by a model.
 */

import { programById, type ProgramId } from "@/shared/catalog";
import type { Evidence, Program } from "@/shared/catalog-schema";
import type { EvaluateResponse, Label } from "@/shared/contracts";

/** Evidence as it is handed to the model: no source ids, no provenance. */
export type SnapshotEvidence = {
  id: string;
  text: string;
  kind: Evidence["kind"];
};

export type EvidenceSnapshot = {
  programId: ProgramId;
  programName: string;
  /** Selected by code from the screening result and never rewritten. */
  label: Label;
  evidence: SnapshotEvidence[];
  /** Checklist ids the model is allowed to use, in the order the app prefers. */
  allowedChecklistIds: string[];
  /** Plain-language labels for those ids, so wording can stay faithful. */
  checklistOptions: { id: string; label: string; requiredness: string | null }[];
  /** Evidence ids any sentence or item may cite. */
  allowedEvidenceIds: string[];
};

/** Caps that keep a snapshot small enough for an on-device model. */
export const SNAPSHOT_LIMITS = {
  maxEvidence: 8,
  maxChecklist: 6,
} as const;

function evidenceById(program: Program, id: string): Evidence | undefined {
  return program.evidence.find((item) => item.id === id);
}

/**
 * Checklist choices are curated: documents whose rule was actually exercised
 * first, then the program's own application routes. Nothing is invented, and
 * the ids stay catalog ids so the server can check them.
 */
function curatedChecklist(
  program: Program,
  firedRuleIds: ReadonlySet<string>,
): { id: string; label: string; requiredness: string | null }[] {
  const docs = program.documents.filter(
    (doc) => doc.whenRuleId === null || firedRuleIds.has(doc.whenRuleId),
  );
  const options = [
    ...docs.map((doc) => ({
      id: doc.id,
      label: doc.label,
      requiredness: doc.requiredness as string,
    })),
    ...program.application.map((app) => ({
      id: app.id,
      label: app.label,
      requiredness: null,
    })),
  ];
  return options.slice(0, SNAPSHOT_LIMITS.maxChecklist);
}

/**
 * Build the snapshot for one screened program. Returns null when the catalog
 * has no such program, or when the result carries no usable evidence at all —
 * in that case the app shows curated text instead of asking for a draft.
 */
export function buildSnapshot(
  response: EvaluateResponse,
  programId: ProgramId,
): EvidenceSnapshot | null {
  const result = response.results.find((r) => r.programId === programId);
  if (!result) return null;
  const program = programById(programId);
  if (!program) return null;

  const firedRuleIds = new Set(result.criteria.filter((c) => c.status === "pass").map((c) => c.id));

  // Reason evidence first (it explains the label), then criterion evidence.
  const ids: string[] = [];
  const push = (id: string): void => {
    if (!ids.includes(id)) ids.push(id);
  };
  for (const id of result.reasonIds) push(id);
  for (const criterion of result.criteria) {
    for (const id of criterion.evidenceIds) push(id);
  }
  if (result.valueEvidenceId) push(result.valueEvidenceId);

  const evidence: SnapshotEvidence[] = [];
  for (const id of ids) {
    if (evidence.length >= SNAPSHOT_LIMITS.maxEvidence) break;
    const found = evidenceById(program, id);
    if (!found) continue; // An id the catalog does not back is dropped, never echoed.
    evidence.push({ id: found.id, text: found.text, kind: found.kind });
  }
  if (evidence.length === 0) return null;

  const checklistOptions = curatedChecklist(program, firedRuleIds);

  return {
    programId,
    programName: program.name,
    label: result.label,
    evidence,
    allowedChecklistIds: checklistOptions.map((option) => option.id),
    checklistOptions,
    allowedEvidenceIds: evidence.map((item) => item.id),
  };
}

/** Snapshots for every screened program, in catalog order. */
export function buildSnapshots(response: EvaluateResponse): EvidenceSnapshot[] {
  const out: EvidenceSnapshot[] = [];
  for (const result of response.results) {
    const snapshot = buildSnapshot(response, result.programId);
    if (snapshot) out.push(snapshot);
  }
  return out;
}
