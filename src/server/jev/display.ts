/**
 * Central display policy: labels, ranking and follow-up selection.
 *
 * Every threshold lives here and is versioned with `POLICY_VERSION`. The values
 * are conservative engineering starting points, not calibrated eligibility
 * probabilities, and they are validated against the project's labeled cases
 * before release.
 *
 * Order of reasoning is fixed and deliberate: rule evidence first, model signal
 * second. A criterion that is unknown, a source that is stale, or coverage we
 * do not support can never be argued into "Likely" by a confident model score.
 */

import type { Label } from "@/shared/contracts";
import type { ProgramScreening } from "@/shared/screening";
import { POLICY_VERSION } from "./policy";

export { POLICY_VERSION };

export const DISPLAY_POLICY = {
  /** Minimum match score on the 0-2 rubric before "Likely" is even possible. */
  likelyMinScore: 1.7,
  /** Minimum model confidence for "Likely". */
  likelyMinConfidence: 0.8,
  /** Below this, the model's own signal is treated as uninformative. */
  lowConfidence: 0.5,
  /** A model score this far below the rubric midpoint contradicts clean rules. */
  contradictionMaxScore: 1.0,
  /** Optional clarification turns before results are shown as they stand. */
  maxFollowUpTurns: 3,
  /** Fields offered in a single turn. */
  maxFollowUpsPerTurn: 3,
} as const;

/* -------------------------------------------------------------------- labels */

export type ModelSignal = {
  /** Match score on the 0-2 rubric. */
  readonly score: number;
  readonly confidence: number;
};

export type LabelInput = {
  readonly screening: ProgramScreening;
  /** False when the program is out of force or the jurisdiction is unsupported. */
  readonly covered: boolean;
  /** True when any cited source is expired or unverified. */
  readonly staleEvidence: boolean;
  /** Null in rules mode: the provider was unavailable or not configured. */
  readonly model: ModelSignal | null;
};

export type LabelOutcome = {
  readonly label: Label;
  /** Policy reason codes, appended to the screening's own reason ids. */
  readonly reasonIds: readonly string[];
  /** True when this label came from rules alone. Shown as a fallback badge. */
  readonly rulesOnly: boolean;
};

function hasExclusion(screening: ProgramScreening): boolean {
  return screening.criteria.some((c) => c.status === "fail");
}

/** Unknowns the catalog itself marks as blocking a "Likely" label. */
function hasBlockingUnknown(screening: ProgramScreening): boolean {
  return screening.criteria.some((c) => c.status === "unknown" && c.blocksLikely);
}

function hasAnyUnknown(screening: ProgramScreening): boolean {
  return screening.criteria.some((c) => c.status === "unknown");
}

function hasPositiveEvidence(screening: ProgramScreening): boolean {
  return screening.criteria.some((c) => c.status === "pass");
}

/**
 * Assigns a preliminary label. Rule blockers are resolved before the model
 * signal is read, so an uncertain or incomplete screening can never become
 * "Likely" on confidence alone.
 */
export function labelFor(input: LabelInput): LabelOutcome {
  const { screening, model } = input;
  const rulesOnly = model === null;

  // 1. A definitive applicable exclusion, with exception paths already resolved
  //    by the screening engine, is a clear non-match with a source-backed reason.
  if (hasExclusion(screening)) {
    return { label: "notAClearMatch", reasonIds: ["policy.rule_exclusion"], rulesOnly };
  }

  // 2. Coverage and evidence blockers: honest uncertainty, never a denial.
  const blockers: string[] = [];
  if (!input.covered) blockers.push("policy.not_covered");
  if (input.staleEvidence) blockers.push("policy.stale_evidence");
  if (hasBlockingUnknown(screening)) blockers.push("policy.material_fact_missing");
  else if (hasAnyUnknown(screening)) blockers.push("policy.unresolved_criterion");
  if (!screening.applicable) blockers.push("policy.not_applicable");

  if (blockers.length > 0) {
    return { label: "possibly", reasonIds: blockers, rulesOnly };
  }

  // 3. Rules mode: complete positive predicates give "Likely — rule check".
  if (rulesOnly) {
    if (hasPositiveEvidence(screening)) {
      return { label: "likely", reasonIds: ["policy.rule_check_complete"], rulesOnly: true };
    }
    return { label: "possibly", reasonIds: ["policy.no_positive_evidence"], rulesOnly: true };
  }

  // 4. Model signal, read only once the rules are clean.
  if (model.confidence < DISPLAY_POLICY.lowConfidence) {
    return { label: "notAClearMatch", reasonIds: ["policy.low_confidence_review"], rulesOnly };
  }
  if (model.score <= DISPLAY_POLICY.contradictionMaxScore) {
    // Clean rules but a model score at the non-match end: a contradiction we
    // surface as uncertainty rather than resolving in either direction.
    return { label: "notAClearMatch", reasonIds: ["policy.signal_conflict"], rulesOnly };
  }
  if (
    hasPositiveEvidence(screening) &&
    model.score >= DISPLAY_POLICY.likelyMinScore &&
    model.confidence >= DISPLAY_POLICY.likelyMinConfidence
  ) {
    return { label: "likely", reasonIds: ["policy.preliminary_match"], rulesOnly };
  }
  return { label: "possibly", reasonIds: ["policy.confirm_a_detail"], rulesOnly };
}

/* ------------------------------------------------------------------- ranking */

const LABEL_ORDER: Record<Label, number> = { likely: 0, possibly: 1, notAClearMatch: 2 };

export type RankableResult = {
  readonly programId: string;
  readonly label: Label;
  /** 0-2 confirmed need relevance; null when unknown or in rules mode. */
  readonly relevance: number | null;
  readonly matchScore: number | null;
  /** Stable catalog position, used as the final tie-break. */
  readonly catalogIndex: number;
};

/**
 * Sorts Likely → Possibly → Other, then by need relevance descending, then by
 * match score descending, then by stable catalog order. A missing score is
 * never read as zero: it sorts below every known score but does not change the
 * label or become a negative judgment.
 */
export function rankResults<T extends RankableResult>(
  results: readonly T[],
): (T & {
  rank: number;
})[] {
  const sorted = [...results].sort((a, b) => {
    const byLabel = LABEL_ORDER[a.label] - LABEL_ORDER[b.label];
    if (byLabel !== 0) return byLabel;
    const relevance = (b.relevance ?? -1) - (a.relevance ?? -1);
    if (relevance !== 0) return relevance;
    const score = (b.matchScore ?? -1) - (a.matchScore ?? -1);
    if (score !== 0) return score;
    return a.catalogIndex - b.catalogIndex;
  });
  return sorted.map((result, index) => ({ ...result, rank: index }));
}

/* -------------------------------------------------------- follow-up questions */

/**
 * Fields whose answer is a policy interpretation only the agency can make. We
 * never ask a person to resolve one of these; they become agency steps instead.
 */
export const AGENCY_ONLY_FIELD_IDS: readonly string[] = [
  "snap.snapExceptionStatus",
  "snap.deductionsAssessed",
  "eitc.specialRuleApplies",
  "eitc.childlessResidenceAndDependencyChecks",
  "ceap.householdDefinitionConfirmed",
  "medicare.countableBasisConfirmed",
  "medicare.specialPathwayReviewNeeded",
  "wic.householdBasisConfirmed",
  "lifeline.householdBasisConfirmed",
  "lifeline.specialPathwayReviewNeeded",
];

/** 1 easy, 2 personal but simple, 3 requires looking something up. */
export function fieldBurden(fieldId: string): number {
  if (/income|Annual|Monthly|Resources|resourcesKnown/i.test(fieldId)) return 3;
  if (/ageBand|employment|medicarePartA|existingLifeline|taxYear|filingStatus/i.test(fieldId)) {
    return 2;
  }
  return 1;
}

export type FollowUpInput = {
  readonly results: readonly {
    readonly programId: string;
    readonly label: Label;
    readonly relevance: number | null;
    readonly missingFieldIds: readonly string[];
  }[];
  /** Fields already asked or already answered; never asked twice. */
  readonly resolvedFieldIds: readonly string[];
  /** Completed optional turns so far. */
  readonly turn: number;
  /** Ordered field list, used for the final stable tie-break. */
  readonly fieldOrder: readonly string[];
};

export type FollowUp = {
  readonly fieldId: string;
  /** How many programs this field would unlock. */
  readonly unlocks: number;
  readonly burden: number;
};

/**
 * Picks the next optional questions: fields code already knows are missing,
 * ranked by how many program pathways each unlocks, then by how little it asks
 * of the person, then by stable field order. Returns an empty list once the
 * turn cap is reached — after that, partial results stand and can be edited.
 */
export function selectFollowUps(input: FollowUpInput): FollowUp[] {
  if (input.turn >= DISPLAY_POLICY.maxFollowUpTurns) return [];

  const resolved = new Set(input.resolvedFieldIds);
  const counts = new Map<string, number>();

  for (const result of input.results) {
    // A program with no stated connection to the need does not get to drive
    // repeated personal questions.
    if (result.relevance === 0) continue;
    if (result.label === "notAClearMatch") continue;
    for (const fieldId of result.missingFieldIds) {
      if (resolved.has(fieldId)) continue;
      if (AGENCY_ONLY_FIELD_IDS.includes(fieldId)) continue;
      counts.set(fieldId, (counts.get(fieldId) ?? 0) + 1);
    }
  }

  const orderIndex = (fieldId: string) => {
    const index = input.fieldOrder.indexOf(fieldId);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return [...counts.entries()]
    .map(([fieldId, unlocks]) => ({ fieldId, unlocks, burden: fieldBurden(fieldId) }))
    .sort(
      (a, b) =>
        b.unlocks - a.unlocks ||
        a.burden - b.burden ||
        orderIndex(a.fieldId) - orderIndex(b.fieldId),
    )
    .slice(0, DISPLAY_POLICY.maxFollowUpsPerTurn);
}

/**
 * Breaks a tie between equally ranked support Nouls by closeness to 0.5: the
 * answers the model is least sure about are the most useful to resolve.
 */
export function mostUncertainNoul(
  nouls: readonly { readonly id: string; readonly noul: number }[],
): string | null {
  if (nouls.length === 0) return null;
  return [...nouls].sort(
    (a, b) => Math.abs(a.noul - 0.5) - Math.abs(b.noul - 0.5) || a.id.localeCompare(b.id),
  )[0]!.id;
}
