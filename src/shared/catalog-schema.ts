/**
 * Catalog contracts and whole-catalog validation.
 *
 * Rules are data, never code: operands are a discriminated runtime union and
 * are never evaluated as strings. Validation rejects dangling IDs, cyclic
 * compound rules, empty evidence, duplicate versions, mixed tax years,
 * non-HTTPS destinations and unsupported currency/period combinations.
 * Freshness is judged against an injected evaluation date, never `Date.now()`
 * inside the schema.
 */

import { z } from "zod";
import {
  factsSchema,
  programExtensionsSchema,
  ceapExtensionSchema,
  eitcExtensionSchema,
  lifelineExtensionSchema,
  medicareExtensionSchema,
  snapExtensionSchema,
  wicExtensionSchema,
  programIdSchema,
} from "./contracts";

const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/, "ids are lowercase and punctuation-limited");

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dates are ISO calendar dates (YYYY-MM-DD)")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "not a real calendar date");

const httpsUrlSchema = z
  .string()
  .url()
  .max(500)
  .refine((v) => v.startsWith("https://"), "destinations must use https");

/** Every field a rule may reference. A rule naming anything else is rejected. */
export const FIELD_IDS: readonly string[] = [
  ...Object.keys(factsSchema.shape),
  ...(
    [
      ["snap", snapExtensionSchema],
      ["eitc", eitcExtensionSchema],
      ["ceap", ceapExtensionSchema],
      ["medicare", medicareExtensionSchema],
      ["wic", wicExtensionSchema],
      ["lifeline", lifelineExtensionSchema],
    ] as const
  ).flatMap(([prefix, schema]) => Object.keys(schema.shape).map((k) => `${prefix}.${k}`)),
];

const fieldIdSchema = z.string().refine((v) => FIELD_IDS.includes(v), {
  message: "unknown field id",
});

export const sourceSchema = z
  .object({
    id: idSchema,
    url: httpsUrlSchema,
    publisher: z.string().min(1).max(200),
    title: z.string().min(1).max(300),
    retrievedOn: isoDateSchema,
    /** A fetched date is not an effective date; `null` means unverified. */
    effectiveFrom: isoDateSchema.nullable(),
    effectiveTo: isoDateSchema.nullable(),
    section: z.string().min(1).max(300),
    reviewStatus: z.enum(["pending", "verified", "conflict", "inaccessible"]),
  })
  .strict()
  .refine(
    (s) => s.effectiveFrom === null || s.effectiveTo === null || s.effectiveTo >= s.effectiveFrom,
    { message: "effectiveTo cannot precede effectiveFrom" },
  );
export type Source = z.infer<typeof sourceSchema>;

export const evidenceSchema = z
  .object({
    id: idSchema,
    text: z.string().min(1).max(600),
    sourceIds: z.array(idSchema).min(1).max(10),
    kind: z.enum(["eligibility", "value", "document", "application", "caveat"]),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;

/* ------------------------------------------------------------ rule operands */

const currencySchema = z.literal("USD");
const thresholdPeriodSchema = z.enum([
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "annual",
  "taxYear",
]);
const basisSchema = z.enum(["gross", "net", "countable", "unknown"]);

/**
 * A published threshold table that varies by household size. Encoded as data so
 * the transcription can be checked against the source row by row.
 */
const householdScaleSchema = z
  .object({
    householdFieldId: fieldIdSchema,
    /** Keys are household sizes as decimal strings, e.g. "1".."10". */
    bySize: z.record(z.string().regex(/^\d+$/), z.number().int().min(0).max(1_000_000_000)),
    /** Published increment for each person beyond the largest listed size. */
    additionalPerPersonCents: z.number().int().min(0).max(1_000_000_000).nullable(),
  })
  .strict()
  .refine((o) => Object.keys(o.bySize).length > 0, { message: "the table cannot be empty" });

const amountThreshold = z
  .object({
    fieldId: fieldIdSchema,
    /** Exactly one of `amountCents` or `householdScale` is present. */
    amountCents: z.number().int().min(0).max(1_000_000_000).nullable(),
    householdScale: householdScaleSchema.nullable(),
    currency: currencySchema,
    period: thresholdPeriodSchema,
    basis: basisSchema,
    /** Required whenever the period is a tax year; rejected otherwise. */
    taxYear: z.number().int().min(2000).max(2100).optional(),
  })
  .strict()
  .refine((o) => (o.period === "taxYear") === (o.taxYear !== undefined), {
    message: "a taxYear period requires a taxYear, and only a taxYear period may carry one",
  })
  .refine((o) => (o.amountCents === null) !== (o.householdScale === null), {
    message: "give either a single amount or a household-size table, not both",
  });

const ruleBaseShape = {
  id: idSchema,
  fieldIds: z.array(fieldIdSchema).max(10),
  evidenceIds: z.array(idSchema).min(1, "a rule cannot cite empty evidence").max(10),
  effect: z.enum(["screening", "exclusion", "referral"]),
  exceptionRuleIds: z.array(idSchema).max(10),
  blocksLikelyWhenUnknown: z.boolean(),
} as const;

const ruleVariant = <T extends string>(operator: T, operands: z.ZodTypeAny) =>
  z.object({ ...ruleBaseShape, operator: z.literal(operator), operands }).strict();

const rangeOperands = z
  .object({
    fieldId: fieldIdSchema,
    minCents: z.number().int().min(0).max(1_000_000_000),
    maxCents: z.number().int().min(0).max(1_000_000_000).nullable(),
    currency: currencySchema,
    period: thresholdPeriodSchema,
    basis: basisSchema,
    taxYear: z.number().int().min(2000).max(2100).optional(),
  })
  .strict()
  .refine((o) => o.maxCents === null || o.maxCents >= o.minCents, {
    message: "the upper endpoint must be at least the lower endpoint",
  })
  .refine((o) => (o.period === "taxYear") === (o.taxYear !== undefined), {
    message: "a taxYear period requires a taxYear",
  });

export const ruleSchema = z.discriminatedUnion("operator", [
  ruleVariant(
    "enumIn",
    z
      .object({
        fieldId: fieldIdSchema,
        values: z.array(z.string().min(1).max(64)).min(1).max(20),
      })
      .strict(),
  ),
  ruleVariant("lte", amountThreshold),
  ruleVariant("gte", amountThreshold),
  ruleVariant("range", rangeOperands),
  ruleVariant("all", z.object({ ruleIds: z.array(idSchema).min(1).max(20) }).strict()),
  ruleVariant("any", z.object({ ruleIds: z.array(idSchema).min(1).max(20) }).strict()),
  ruleVariant("referral", z.object({ reasonCode: z.string().min(1).max(64) }).strict()),
]);

export type Rule = z.infer<typeof ruleSchema>;

export const programSchema = z
  .object({
    id: programIdSchema,
    name: z.string().min(1).max(120),
    jurisdiction: z.enum(["TX", "US"]),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "versions are semver"),
    status: z.enum(["draft", "reviewed", "published", "retired"]),
    validFrom: isoDateSchema,
    /** `null` is not "valid forever"; reviewDueOn still gates freshness. */
    validTo: isoDateSchema.nullable(),
    reviewDueOn: isoDateSchema,
    coverage: z.string().min(1).max(600),
    limitations: z.array(z.string().min(1).max(300)).max(20),
    eligibilitySummary: z.array(z.string().min(1).max(300)).min(2).max(4),
    evidence: z.array(evidenceSchema).min(1).max(80),
    rules: z.array(ruleSchema).max(60),
    requiredFieldIds: z.array(fieldIdSchema).max(40),
    optionalFieldIds: z.array(fieldIdSchema).max(40),
    value: z
      .object({
        kind: z.enum(["variable", "discount", "maximum", "range"]),
        text: z.string().min(1).max(300),
        evidenceIds: z.array(idSchema).min(1).max(10),
        period: z.enum(["month", "taxYear", "year", "varies"]),
        taxYear: z.number().int().min(2000).max(2100).optional(),
      })
      .strict()
      .refine((v) => v.period !== "taxYear" || v.taxYear !== undefined, {
        message: "a tax-year value must name its tax year",
      }),
    documents: z
      .array(
        z
          .object({
            id: idSchema,
            label: z.string().min(1).max(200),
            whenRuleId: idSchema.nullable(),
            requiredness: z.enum(["required", "mayNeed", "askAgency"]),
            evidenceIds: z.array(idSchema).min(1).max(10),
          })
          .strict(),
      )
      .max(20),
    application: z
      .array(
        z
          .object({
            id: idSchema,
            label: z.string().min(1).max(200),
            url: httpsUrlSchema,
            evidenceIds: z.array(idSchema).min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    fallbackExplanation: z.string().min(1).max(600),
    fallbackChecklistIds: z.array(idSchema).max(10),
  })
  .strict()
  .refine((p) => p.validTo === null || p.validTo >= p.validFrom, {
    message: "validTo cannot precede validFrom",
  });
export type Program = z.infer<typeof programSchema>;

export const manifestSchema = z
  .object({
    catalogVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    rulesVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    builtOn: isoDateSchema,
    programs: z
      .array(
        z
          .object({ id: programIdSchema, version: z.string(), contentHash: z.string().length(64) })
          .strict(),
      )
      .max(6),
  })
  .strict();
export type Manifest = z.infer<typeof manifestSchema>;

/* ------------------------------------------------------- catalog validation */

export type CatalogIssue = {
  /** `error` blocks the release; `unsupported` demotes the entry honestly. */
  severity: "error" | "unsupported";
  programId: string;
  code: string;
  detail: string;
};

export type ValidateOptions = {
  /** Injected; never read from the clock inside validation. */
  evaluationDate: string;
  sources: Source[];
};

function collectCycles(program: Program): string[] {
  const byId = new Map(program.rules.map((r) => [r.id, r]));
  const state = new Map<string, "visiting" | "done">();
  const cycles: string[] = [];

  const visit = (id: string, trail: string[]): void => {
    const current = state.get(id);
    if (current === "done") return;
    if (current === "visiting") {
      cycles.push([...trail.slice(trail.indexOf(id)), id].join(" → "));
      return;
    }
    const rule = byId.get(id);
    if (!rule) return;
    state.set(id, "visiting");
    const children =
      rule.operator === "all" || rule.operator === "any"
        ? (rule.operands as { ruleIds: string[] }).ruleIds
        : [];
    for (const child of [...children, ...rule.exceptionRuleIds]) visit(child, [...trail, id]);
    state.set(id, "done");
  };

  for (const rule of program.rules) visit(rule.id, []);
  return [...new Set(cycles)];
}

export function validateCatalog(programs: Program[], options: ValidateOptions): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const add = (
    severity: CatalogIssue["severity"],
    programId: string,
    code: string,
    detail: string,
  ) => issues.push({ severity, programId, code, detail });

  const sourceIds = new Set(options.sources.map((s) => s.id));
  const seen = new Map<string, Set<string>>();

  for (const program of programs) {
    const versions = seen.get(program.id) ?? new Set<string>();
    if (versions.has(program.version))
      add("error", program.id, "duplicate_version", `version ${program.version} appears twice`);
    versions.add(program.version);
    seen.set(program.id, versions);

    const evidenceIds = new Set(program.evidence.map((e) => e.id));
    const ruleIds = new Set(program.rules.map((r) => r.id));

    for (const evidence of program.evidence) {
      for (const sourceId of evidence.sourceIds) {
        if (!sourceIds.has(sourceId))
          add(
            "error",
            program.id,
            "dangling_source",
            `${evidence.id} cites missing source ${sourceId}`,
          );
      }
      const referenced = options.sources.filter((s) => evidence.sourceIds.includes(s.id));
      if (referenced.length > 0 && referenced.every((s) => s.reviewStatus !== "verified"))
        add(
          "unsupported",
          program.id,
          "unverified_source",
          `${evidence.id} has no verified source and can only support a referral`,
        );
      for (const source of referenced) {
        if (source.effectiveTo !== null && source.effectiveTo < options.evaluationDate)
          add(
            "unsupported",
            program.id,
            "expired_source",
            `${evidence.id} cites ${source.id}, which expired on ${source.effectiveTo}`,
          );
      }
    }

    const checkEvidence = (owner: string, ids: string[]) => {
      if (ids.length === 0)
        add("error", program.id, "empty_evidence", `${owner} cites no evidence`);
      for (const id of ids)
        if (!evidenceIds.has(id))
          add("error", program.id, "dangling_evidence", `${owner} cites missing evidence ${id}`);
    };

    for (const rule of program.rules) {
      checkEvidence(`rule ${rule.id}`, rule.evidenceIds);
      const children =
        rule.operator === "all" || rule.operator === "any"
          ? (rule.operands as { ruleIds: string[] }).ruleIds
          : [];
      for (const child of [...children, ...rule.exceptionRuleIds])
        if (!ruleIds.has(child))
          add(
            "error",
            program.id,
            "dangling_rule",
            `rule ${rule.id} references missing rule ${child}`,
          );
    }

    for (const cycle of collectCycles(program))
      add("error", program.id, "cyclic_rule", `compound rules form a cycle: ${cycle}`);

    checkEvidence("value", program.value.evidenceIds);
    for (const doc of program.documents) checkEvidence(`document ${doc.id}`, doc.evidenceIds);
    for (const app of program.application) checkEvidence(`application ${app.id}`, app.evidenceIds);
    for (const doc of program.documents) {
      if (doc.whenRuleId !== null && !ruleIds.has(doc.whenRuleId))
        add(
          "error",
          program.id,
          "dangling_rule",
          `document ${doc.id} references missing rule ${doc.whenRuleId}`,
        );
    }
    for (const id of program.fallbackChecklistIds) {
      if (
        !program.documents.some((d) => d.id === id) &&
        !program.application.some((a) => a.id === id)
      )
        add(
          "error",
          program.id,
          "dangling_checklist",
          `fallback checklist item ${id} does not exist`,
        );
    }

    const taxYears = new Set<number>();
    for (const rule of program.rules) {
      const operands = rule.operands as { taxYear?: number };
      if (typeof operands.taxYear === "number") taxYears.add(operands.taxYear);
    }
    if (program.value.taxYear !== undefined) taxYears.add(program.value.taxYear);
    if (taxYears.size > 1)
      add(
        "error",
        program.id,
        "mixed_tax_years",
        `rules mix tax years ${[...taxYears].sort().join(", ")}`,
      );

    if (program.reviewDueOn < options.evaluationDate)
      add(
        "unsupported",
        program.id,
        "review_overdue",
        `review was due on ${program.reviewDueOn}; the entry demotes to a referral`,
      );
    if (program.validTo !== null && program.validTo < options.evaluationDate)
      add("unsupported", program.id, "expired_program", `the entry expired on ${program.validTo}`);
    if (program.status !== "published")
      add("unsupported", program.id, "not_published", `status is ${program.status}`);
  }

  return issues;
}

export const PROGRAM_EXTENSION_KEYS = Object.keys(programExtensionsSchema.shape);

/**
 * The published threshold for a household size, extending the table with the
 * published per-person increment. Returns `null` when the size is unknown or
 * the table cannot be extended, so the caller reports `unknown` instead of
 * inventing a limit.
 */
export function thresholdForHousehold(
  scale: { bySize: Record<string, number>; additionalPerPersonCents: number | null },
  householdSize: number | null,
): number | null {
  if (householdSize === null || !Number.isInteger(householdSize) || householdSize < 0) return null;
  const direct = scale.bySize[String(householdSize)];
  if (direct !== undefined) return direct;
  const sizes = Object.keys(scale.bySize).map(Number);
  if (sizes.length === 0 || scale.additionalPerPersonCents === null) return null;
  const largest = Math.max(...sizes);
  if (householdSize < largest) return null;
  const base = scale.bySize[String(largest)];
  if (base === undefined) return null;
  return base + (householdSize - largest) * scale.additionalPerPersonCents;
}
