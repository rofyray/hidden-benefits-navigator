/**
 * Which follow-up to ask next.
 *
 * Selection is pure code over the reviewed facts: a question is a candidate only
 * when its field is still an explicit unknown, or when the extractor flagged it
 * as not clear. Nothing here looks at a model output, so a model can never cause
 * an extra question, and a fact a person has already given is never asked again.
 *
 * Programme-specific questions are only considered for the groups this run
 * actually needs, so nobody is walked through six programmes' worth of fields.
 */

import { getFieldValue, type ReviewState } from "@/client/review/state";
import { selectGroups } from "@/client/extraction/extract";
import type { ExtractionGroup } from "@/shared/extraction-schema";
import { MAX_CANDIDATES_PER_TURN, QUESTION_BANK, type ClarifyQuestion } from "./questions";

/** A field is missing when it holds an explicit unknown, not a real answer. */
export function isMissingValue(value: unknown): boolean {
  return value === null || value === undefined || value === "unknown" || value === "";
}

function groupOf(path: string): ExtractionGroup | null {
  const [head, tail] = path.split(".");
  if (tail === undefined || !head) return null;
  return head as ExtractionGroup;
}

/** True when this question still has something to add for this person. */
export function isNeeded(
  state: ReviewState,
  question: ClarifyQuestion,
  activeGroups: readonly ExtractionGroup[],
): boolean {
  const group = groupOf(question.path);
  if (group !== null && !activeGroups.includes(group)) return false;
  if (state.ambiguous[question.path]) return true;
  const current = getFieldValue(state, question.path);
  if (question.needed) return question.needed(current);
  return isMissingValue(current);
}

export function activeGroupsFor(state: ReviewState): ExtractionGroup[] {
  return state.groupsAsked.length > 0 ? [...state.groupsAsked] : selectGroups(state.facts);
}

/**
 * Candidate questions in authored priority order, excluding anything the person
 * has already answered, said they were unsure about, or chosen to skip.
 */
export function selectClarifications(
  state: ReviewState,
  options: { resolved?: readonly string[]; skipped?: readonly string[]; limit?: number } = {},
): ClarifyQuestion[] {
  const resolved = new Set(options.resolved ?? []);
  const skipped = new Set(options.skipped ?? []);
  const activeGroups = activeGroupsFor(state);
  const limit = options.limit ?? MAX_CANDIDATES_PER_TURN;
  const candidates: ClarifyQuestion[] = [];
  for (const question of QUESTION_BANK) {
    if (resolved.has(question.id) || skipped.has(question.id)) continue;
    if (!isNeeded(state, question, activeGroups)) continue;
    candidates.push(question);
    if (candidates.length >= limit) break;
  }
  return candidates;
}
