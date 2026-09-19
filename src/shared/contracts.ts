/**
 * Shared runtime contracts.
 *
 * One Zod package used by the browser and the server. Strict objects, explicit
 * bounds and explicit unknown/null semantics: missing is `null` or `'unknown'`,
 * never `0` or `false`. Out-of-range values are rejected so the caller can ask
 * for a correction or route to assisted help; nothing is silently clamped.
 */

import { z } from "zod";

export const SCHEMA_VERSION = "1" as const;

/** Input-sanity cap on any monetary amount, in integer cents. */
export const MAX_CENTS = 1_000_000_000;
export const MAX_HOUSEHOLD = 20;
export const MAX_EXPECTED_INFANTS = 10;

export const triSchema = z.enum(["yes", "no", "unknown"]);
export type Tri = z.infer<typeof triSchema>;

export const programIdSchema = z.enum(["snap", "wic", "medicare_help", "lifeline", "eitc", "ceap"]);
export type ProgramId = z.infer<typeof programIdSchema>;

export const needSchema = z.enum(["food", "tax", "utilities", "medicare", "phone", "unspecified"]);

export const periodSchema = z.enum(["weekly", "biweekly", "semimonthly", "monthly", "annual"]);
export type IncomePeriod = z.infer<typeof periodSchema>;

export const incomeBasisSchema = z.enum(["gross", "net", "unknown"]);

const centsSchema = z
  .number()
  .int("amounts are integer cents")
  .min(0, "amounts cannot be negative")
  .max(MAX_CENTS, "amount is outside the supported range");

export const moneyIntervalSchema = z
  .object({
    minCents: centsSchema,
    /** `null` means open-ended upward, not "unlimited income". */
    maxCents: centsSchema.nullable(),
  })
  .strict()
  .refine((v) => v.maxCents === null || v.maxCents >= v.minCents, {
    message: "the upper endpoint must be at least the lower endpoint",
  });
export type MoneyInterval = z.infer<typeof moneyIntervalSchema>;

const householdSchema = z.number().int().min(1).max(MAX_HOUSEHOLD).nullable();

export const factsSchema = z
  .object({
    need: needSchema,
    state: z.enum(["TX", "other"]).nullable(),
    householdSize: householdSchema,
    /** SNAP purchasing/preparing group; not the same as householdSize. */
    foodHouseholdSize: householdSchema,
    income: z
      .object({
        interval: moneyIntervalSchema,
        period: periodSchema,
        basis: incomeBasisSchema,
      })
      .strict()
      .nullable(),
    ageBand: z.enum(["under18", "18to59", "60to64", "65plus"]).nullable(),
    employment: z.enum(["employed", "selfEmployed", "unemployed", "retired", "other"]).nullable(),
    medicarePartA: triSchema,
    pregnant: triSchema,
    postpartumUnder6Months: triSchema,
    breastfeedingUnder12Months: triSchema,
    childUnder5: triSchema,
    receivesSnap: triSchema,
    receivesMedicaid: triSchema,
    receivesSsi: triSchema,
    receivesTanf: triSchema,
    receivesHousingAid: triSchema,
    receivesVeteransPension: triSchema,
    existingLifeline: triSchema,
    sharesFood: triSchema,
    /** Does not assert that resources meet any limit. */
    resourcesKnown: triSchema,
  })
  .strict();
export type Facts = z.infer<typeof factsSchema>;

export const snapExtensionSchema = z
  .object({
    olderOrDisabled: triSchema,
    snapExceptionStatus: z.enum(["applies", "doesNotApply", "unknown"]),
    deductionsAssessed: triSchema,
    countableNetMonthly: moneyIntervalSchema.nullable(),
  })
  .strict();

export const eitcExtensionSchema = z
  .object({
    /** Validated against the catalog's published tax-year enum, not by range. */
    taxYear: z.number().int().min(2000).max(2100).nullable(),
    filingStatus: z.enum([
      "single",
      "headOfHousehold",
      "joint",
      "separate",
      "survivingSpouse",
      "unknown",
    ]),
    earnedAnnual: moneyIntervalSchema.nullable(),
    agiAnnual: moneyIntervalSchema.nullable(),
    /** 3 means a confirmed "3 or more". */
    qualifyingChildrenCount: z
      .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
      .nullable(),
    investmentIncomeWithinLimit: triSchema,
    childlessAge25to64: triSchema,
    specialRuleApplies: triSchema,
    childlessResidenceAndDependencyChecks: triSchema,
  })
  .strict();

export const ceapExtensionSchema = z
  .object({
    utilityResponsibility: triSchema,
    needsHeatingCoolingHelp: triSchema,
    householdDefinitionConfirmed: triSchema,
  })
  .strict();

export const medicareExtensionSchema = z
  .object({
    partBID: triSchema,
    category: z.enum(["individual", "couple", "unknown"]),
    countableMonthly: moneyIntervalSchema.nullable(),
    countableResources: moneyIntervalSchema.nullable(),
    countableBasisConfirmed: triSchema,
    receivesOtherMedicaid: triSchema,
    receivesMsp: triSchema,
    receivesFullMedicaid: triSchema,
    extraHelpAnnualIncome: moneyIntervalSchema.nullable(),
    extraHelpResources: moneyIntervalSchema.nullable(),
    extraHelpBasisConfirmed: triSchema,
    specialPathwayReviewNeeded: triSchema,
  })
  .strict();

export const wicExtensionSchema = z
  .object({
    applicableHouseholdSize: householdSchema,
    expectedInfants: z.number().int().min(0).max(MAX_EXPECTED_INFANTS).nullable(),
    householdBasisConfirmed: triSchema,
  })
  .strict();

export const lifelineExtensionSchema = z
  .object({
    economicHouseholdSize: householdSchema,
    householdBasisConfirmed: triSchema,
    specialPathwayReviewNeeded: triSchema,
  })
  .strict();

export const programExtensionsSchema = z
  .object({
    snap: snapExtensionSchema,
    eitc: eitcExtensionSchema,
    ceap: ceapExtensionSchema,
    medicare: medicareExtensionSchema,
    wic: wicExtensionSchema,
    lifeline: lifelineExtensionSchema,
  })
  .strict();
export type ProgramExtensions = z.infer<typeof programExtensionsSchema>;

export const criterionStatusSchema = z.enum(["pass", "fail", "unknown", "notApplicable"]);

export const criterionResultSchema = z
  .object({
    id: z.string().min(1).max(64),
    status: criterionStatusSchema,
    evidenceIds: z.array(z.string().min(1).max(64)).max(20),
    reasonCode: z.string().min(1).max(64),
    /** Authored in the catalog, never inferred by a model. */
    blocksLikely: z.boolean(),
  })
  .strict();
export type CriterionResult = z.infer<typeof criterionResultSchema>;

export const labelSchema = z.enum(["likely", "possibly", "notAClearMatch"]);
export type Label = z.infer<typeof labelSchema>;

/* ---------------------------------------------------------------- envelopes */

const revisionSchema = z.number().int().min(0).max(100_000);
const versionSchema = z.string().min(1).max(64);

export const evaluateRequestSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    revision: revisionSchema,
    catalogVersion: versionSchema,
    facts: factsSchema,
    extensions: programExtensionsSchema,
    programIds: z.array(programIdSchema).min(1).max(6),
  })
  .strict();
export type EvaluateRequest = z.infer<typeof evaluateRequestSchema>;

export const evaluateResultSchema = z
  .object({
    programId: programIdSchema,
    label: labelSchema,
    criteria: z.array(criterionResultSchema).max(60),
    reasonIds: z.array(z.string().min(1).max(64)).max(20),
    missingFieldIds: z.array(z.string().min(1).max(64)).max(40),
    /** Debug metadata only; never shown as an approval chance. */
    matchScore: z.number().min(0).max(2).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    rank: z.number().int().min(0).max(100),
    valueEvidenceId: z.string().min(1).max(64).nullable(),
  })
  .strict();

export const evaluateResponseSchema = z
  .object({
    revision: revisionSchema,
    catalogVersion: versionSchema,
    rulesVersion: versionSchema,
    evaluationToken: z.string().min(1).max(4096),
    model: z.string().min(1).max(64).nullable(),
    engine: z.enum(["jev", "rules"]),
    results: z.array(evaluateResultSchema).max(6),
    questionVersion: versionSchema,
    policyVersion: versionSchema,
  })
  .strict();
export type EvaluateResponse = z.infer<typeof evaluateResponseSchema>;

/** Application limits, not vendor limits. */
export const LIMITS = {
  maxBodyBytes: 32 * 1024,
  maxPrograms: 6,
  maxSentencesPerProgram: 3,
  maxSentenceChars: 200,
  maxChecklistPerProgram: 6,
} as const;

const draftItemSchema = z
  .object({
    id: z.string().min(1).max(64),
    text: z.string().min(1).max(LIMITS.maxSentenceChars),
    evidenceIds: z.array(z.string().min(1).max(64)).min(1).max(10),
  })
  .strict();

export const verifyRequestSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    revision: revisionSchema,
    catalogVersion: versionSchema,
    evaluationToken: z.string().min(1).max(4096),
    drafts: z
      .array(
        z
          .object({
            programId: programIdSchema,
            sentences: z.array(draftItemSchema).max(LIMITS.maxSentencesPerProgram),
            checklist: z.array(draftItemSchema).max(LIMITS.maxChecklistPerProgram),
          })
          .strict(),
      )
      .min(1)
      .max(LIMITS.maxPrograms),
  })
  .strict();
export type VerifyRequest = z.infer<typeof verifyRequestSchema>;

export const verifyResponseSchema = z
  .object({
    revision: revisionSchema,
    engine: z.enum(["jev", "rules"]),
    programs: z
      .array(
        z
          .object({
            programId: programIdSchema,
            status: z.enum(["approved", "fallback"]),
            approvedSentenceIds: z.array(z.string().min(1).max(64)).max(10),
            approvedChecklistIds: z.array(z.string().min(1).max(64)).max(10),
            reasonCodes: z.array(z.string().min(1).max(64)).max(10),
          })
          .strict(),
      )
      .max(LIMITS.maxPrograms),
    model: z.string().min(1).max(64).nullable(),
  })
  .strict();
export type VerifyResponse = z.infer<typeof verifyResponseSchema>;

export const errorResponseSchema = z
  .object({
    error: z.enum([
      "invalid_request",
      "too_large",
      "catalog_changed",
      "reevaluate_required",
      "busy",
      "provider_unavailable",
      "not_configured",
      "timed_out",
    ]),
    /** Plain-language next step; never echoes submitted content. */
    action: z.string().min(1).max(200),
    correlationId: z.string().min(1).max(64),
  })
  .strict();
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const healthResponseSchema = z
  .object({
    ready: z.boolean(),
    catalogVersion: z.string(),
    jevConfigured: z.boolean(),
    cloudConfigured: z.boolean(),
  })
  .strict();
