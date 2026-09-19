/**
 * Validation of what the on-device model proposes.
 *
 * A structured-output constraint proves shape, not truth. Everything here
 * assumes the answer may be wrong, malicious or shaped like the schema while
 * being invented, so:
 *
 * - Defaults are explicit unknowns, never zeros or falses.
 * - The shared runtime contract validates every proposal; a proposal that fails
 *   is discarded whole, and the previous values stand.
 * - Text that looks like an identifier, a contact detail or a URL is rejected
 *   before validation, so a narrative cannot smuggle personal data forward.
 * - Vague amounts stay vague: a range is kept as a range and flagged ambiguous
 *   so the person is asked rather than told.
 */

import { z } from "zod";
import {
  factsSchema,
  programExtensionsSchema,
  type Facts,
  type ProgramExtensions,
} from "@/shared/contracts";
import { extensionZodByGroup, type ExtractionGroup } from "@/shared/extraction-schema";

export type FactOrigin = "extracted" | "confirmed" | "manual";

/** Per-field review metadata kept in memory only; never sent anywhere. */
export type FactRecord = {
  field: string;
  origin: FactOrigin;
  ambiguous: boolean;
};

export type ProposalFailure =
  "not_json" | "schema_invalid" | "identifier_present" | "too_long" | "empty";

export type ProposalResult<T> =
  { ok: true; value: T; records: FactRecord[] } | { ok: false; failure: ProposalFailure };

/** Bound on a single constrained answer; anything larger is not a fact list. */
export const MAX_PROPOSAL_CHARS = 4000;

/** Explicit-unknown baseline for the common facts. */
export function emptyFacts(): Facts {
  return {
    need: "unspecified",
    state: null,
    householdSize: null,
    foodHouseholdSize: null,
    income: null,
    ageBand: null,
    employment: null,
    medicarePartA: "unknown",
    pregnant: "unknown",
    postpartumUnder6Months: "unknown",
    breastfeedingUnder12Months: "unknown",
    childUnder5: "unknown",
    receivesSnap: "unknown",
    receivesMedicaid: "unknown",
    receivesSsi: "unknown",
    receivesTanf: "unknown",
    receivesHousingAid: "unknown",
    receivesVeteransPension: "unknown",
    existingLifeline: "unknown",
    sharesFood: "unknown",
    resourcesKnown: "unknown",
  };
}

/** Explicit-unknown baseline for every program group, including unasked ones. */
export function emptyExtensions(): ProgramExtensions {
  return {
    snap: {
      olderOrDisabled: "unknown",
      snapExceptionStatus: "unknown",
      deductionsAssessed: "unknown",
      countableNetMonthly: null,
    },
    eitc: {
      taxYear: null,
      filingStatus: "unknown",
      earnedAnnual: null,
      agiAnnual: null,
      qualifyingChildrenCount: null,
      investmentIncomeWithinLimit: "unknown",
      childlessAge25to64: "unknown",
      specialRuleApplies: "unknown",
      childlessResidenceAndDependencyChecks: "unknown",
    },
    ceap: {
      utilityResponsibility: "unknown",
      needsHeatingCoolingHelp: "unknown",
      householdDefinitionConfirmed: "unknown",
    },
    medicare: {
      partBID: "unknown",
      category: "unknown",
      countableMonthly: null,
      countableResources: null,
      countableBasisConfirmed: "unknown",
      receivesOtherMedicaid: "unknown",
      receivesMsp: "unknown",
      receivesFullMedicaid: "unknown",
      extraHelpAnnualIncome: null,
      extraHelpResources: null,
      extraHelpBasisConfirmed: "unknown",
      specialPathwayReviewNeeded: "unknown",
    },
    wic: {
      applicableHouseholdSize: null,
      expectedInfants: null,
      householdBasisConfirmed: "unknown",
    },
    lifeline: {
      economicHouseholdSize: null,
      householdBasisConfirmed: "unknown",
      specialPathwayReviewNeeded: "unknown",
    },
  };
}

/**
 * Patterns that must never appear in a proposal. The contracts admit no free
 * text, so any match means the model went outside the schema — the whole
 * proposal is discarded rather than cleaned.
 */
const FORBIDDEN = [
  /https?:\/\//i,
  /www\./i,
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
  /\b\d{3}[ .-]\d{2}[ .-]\d{4}\b/, // social-security shaped
  /\b\d{3}[ .-]\d{3}[ .-]\d{4}\b/, // phone shaped
  /\b\d{9,}\b/, // account or document numbers
];

export function containsIdentifier(raw: string): boolean {
  return FORBIDDEN.some((pattern) => pattern.test(raw));
}

function isAmbiguousInterval(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!("minCents" in obj)) return false;
  const min = obj["minCents"];
  const max = obj["maxCents"];
  if (max === null) return true;
  return typeof min === "number" && typeof max === "number" && max !== min;
}

function recordsFor(prefix: string, value: Record<string, unknown>): FactRecord[] {
  const records: FactRecord[] = [];
  for (const [key, raw] of Object.entries(value)) {
    if (raw === null || raw === "unknown") continue;
    const nested =
      raw !== null && typeof raw === "object" && "interval" in (raw as Record<string, unknown>)
        ? (raw as Record<string, unknown>)["interval"]
        : raw;
    records.push({
      field: prefix ? `${prefix}.${key}` : key,
      origin: "extracted",
      ambiguous: isAmbiguousInterval(nested),
    });
  }
  return records;
}

function parseProposal<T>(
  raw: string,
  key: string,
  schema: z.ZodTypeAny,
  prefix: string,
): ProposalResult<T> {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, failure: "empty" };
  if (text.length > MAX_PROPOSAL_CHARS) return { ok: false, failure: "too_long" };
  if (containsIdentifier(text)) return { ok: false, failure: "identifier_present" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, failure: "not_json" };
  }
  if (typeof parsed !== "object" || parsed === null)
    return { ok: false, failure: "schema_invalid" };

  const inner = (parsed as Record<string, unknown>)[key];
  const result = schema.safeParse(inner);
  if (!result.success) return { ok: false, failure: "schema_invalid" };

  return {
    ok: true,
    value: result.data as T,
    records: recordsFor(prefix, result.data as Record<string, unknown>),
  };
}

/** Validates a common-facts proposal. */
export function parseCommonProposal(raw: string): ProposalResult<Facts> {
  return parseProposal<Facts>(raw, "facts", factsSchema, "");
}

/** Validates one program group's proposal. */
export function parseGroupProposal(
  group: ExtractionGroup,
  raw: string,
): ProposalResult<ProgramExtensions[ExtractionGroup]> {
  return parseProposal(raw, group, extensionZodByGroup[group], group);
}

/** Final safety net: the merged result must satisfy the shared contracts. */
export function validateExtraction(facts: Facts, extensions: ProgramExtensions): boolean {
  return (
    factsSchema.safeParse(facts).success && programExtensionsSchema.safeParse(extensions).success
  );
}
