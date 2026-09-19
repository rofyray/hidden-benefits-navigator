/**
 * Deterministic screening.
 *
 * Given the same facts, catalog and evaluation date, this produces the same
 * criterion statuses every time. It is data-driven: rules are read from the
 * catalog and interpreted here, so nothing in a catalog file can execute code.
 *
 * Four-state logic throughout. An unknown never becomes a `no` and a missing
 * amount never becomes zero; both are reported as unknown with the field ids
 * that would resolve them.
 */

import type { Program, Rule } from "./catalog-schema";
import { thresholdForHousehold } from "./catalog-schema";
import type { CriterionResult, Facts, ProgramExtensions } from "./contracts";
import {
  annualEndpoints,
  annualizeCents,
  basisIsComparable,
  isoDateInRange,
  resolveField,
  type ThresholdPeriod,
} from "./normalization";

export const RULES_VERSION = "1.0.0";

export type Status = CriterionResult["status"];

export type ScreeningInput = {
  readonly program: Program;
  readonly facts: Facts;
  readonly extensions: ProgramExtensions;
  /** Injected ISO calendar date; never read from the host clock in here. */
  readonly evaluationDate: string;
};

export type ProgramScreening = {
  readonly programId: Program["id"];
  readonly applicable: boolean;
  readonly criteria: readonly CriterionResult[];
  /** Field ids that would resolve an unknown, in catalog order, deduplicated. */
  readonly missingFieldIds: readonly string[];
  /** Evidence ids the results rest on, for the client fallback and for /verify. */
  readonly evidenceIds: readonly string[];
  readonly reasonIds: readonly string[];
};

/* ------------------------------------------------------------------ helpers */

function kleeneAll(statuses: readonly Status[]): Status {
  if (statuses.some((s) => s === "fail")) return "fail";
  if (statuses.some((s) => s === "unknown")) return "unknown";
  const considered = statuses.filter((s) => s !== "notApplicable");
  return considered.length === 0 ? "notApplicable" : "pass";
}

function kleeneAny(statuses: readonly Status[]): Status {
  if (statuses.some((s) => s === "pass")) return "pass";
  if (statuses.some((s) => s === "unknown")) return "unknown";
  const considered = statuses.filter((s) => s !== "notApplicable");
  return considered.length === 0 ? "notApplicable" : "fail";
}

type EvalContext = {
  readonly byId: ReadonlyMap<string, Rule>;
  readonly facts: Facts;
  readonly extensions: ProgramExtensions;
  readonly results: Map<string, CriterionResult>;
  readonly visiting: Set<string>;
  readonly missing: string[];
};

function noteMissing(ctx: EvalContext, fieldIds: readonly string[]): void {
  for (const id of fieldIds) if (!ctx.missing.includes(id)) ctx.missing.push(id);
}

function result(rule: Rule, status: Status, reasonCode: string, ctx: EvalContext): CriterionResult {
  if (status === "unknown") noteMissing(ctx, rule.fieldIds);
  const criterion: CriterionResult = {
    id: rule.id,
    status,
    evidenceIds: [...rule.evidenceIds],
    reasonCode,
    blocksLikely: rule.blocksLikelyWhenUnknown,
  };
  ctx.results.set(rule.id, criterion);
  return criterion;
}

/* ------------------------------------------------------------ rule operators */

function evaluateEnumIn(rule: Rule & { operator: "enumIn" }, ctx: EvalContext): CriterionResult {
  const value = resolveField(rule.operands.fieldId, ctx.facts, ctx.extensions);
  const allowed = rule.operands.values;

  if (value.kind === "absent") return result(rule, "unknown", "field_not_collected", ctx);
  if (value.kind === "tri") {
    if (value.value === "unknown") return result(rule, "unknown", "answer_unknown", ctx);
    return result(
      rule,
      allowed.includes(value.value) ? "pass" : "fail",
      allowed.includes(value.value) ? "stated_value_matches" : "stated_value_does_not_match",
      ctx,
    );
  }
  if (value.kind === "enum" || value.kind === "number") {
    if (value.value === null) return result(rule, "unknown", "answer_unknown", ctx);
    const asText = String(value.value);
    if (asText === "unknown") return result(rule, "unknown", "answer_unknown", ctx);
    return result(
      rule,
      allowed.includes(asText) ? "pass" : "fail",
      allowed.includes(asText) ? "stated_value_matches" : "stated_value_does_not_match",
      ctx,
    );
  }
  return result(rule, "unknown", "field_type_mismatch", ctx);
}

type AmountOperands = {
  fieldId: string;
  amountCents: number | null;
  householdScale: {
    householdFieldId: string;
    bySize: Record<string, number>;
    additionalPerPersonCents: number | null;
  } | null;
  period: ThresholdPeriod;
  basis: "gross" | "net" | "countable" | "unknown";
  taxYear?: number;
};

function readMoney(
  fieldId: string,
  operands: { period: ThresholdPeriod; basis: string },
  ctx: EvalContext,
): { ok: true; min: number; max: number | null } | { ok: false; reasonCode: string } {
  const value = resolveField(fieldId, ctx.facts, ctx.extensions);
  if (value.kind === "absent") return { ok: false, reasonCode: "field_not_collected" };
  if (value.kind !== "money") return { ok: false, reasonCode: "field_type_mismatch" };
  if (value.interval === null) return { ok: false, reasonCode: "amount_unknown" };

  // A stated common income carries its own period and basis and must match the
  // published threshold's. A program extension band is defined by the contract
  // to be the measure the rule names, so the rule's period and basis apply.
  if (value.period !== null) {
    if (
      !basisIsComparable(value.basis, operands.basis as "gross" | "net" | "countable" | "unknown")
    ) {
      return { ok: false, reasonCode: "income_basis_not_comparable" };
    }
    return { ok: true, ...annualEndpoints(value.interval, value.period) };
  }
  return { ok: true, ...annualEndpoints(value.interval, operands.period) };
}

function thresholdCentsFor(operands: AmountOperands, ctx: EvalContext): number | null {
  if (operands.amountCents !== null) return operands.amountCents;
  if (operands.householdScale === null) return null;
  const sizeField = resolveField(
    operands.householdScale.householdFieldId,
    ctx.facts,
    ctx.extensions,
  );
  const size = sizeField.kind === "number" ? sizeField.value : null;
  return thresholdForHousehold(operands.householdScale, size);
}

function evaluateThreshold(
  rule: Rule & { operator: "lte" | "gte" },
  ctx: EvalContext,
): CriterionResult {
  const operands = rule.operands as AmountOperands;

  if (operands.period === "taxYear" && !taxYearMatches(operands.taxYear, ctx)) {
    return result(rule, "unknown", "tax_year_not_confirmed", ctx);
  }

  const money = readMoney(operands.fieldId, operands, ctx);
  if (!money.ok) return result(rule, "unknown", money.reasonCode, ctx);

  const cents = thresholdCentsFor(operands, ctx);
  if (cents === null) {
    if (operands.householdScale !== null) {
      noteMissing(ctx, [operands.householdScale.householdFieldId]);
    }
    return result(rule, "unknown", "no_published_limit_for_this_household", ctx);
  }
  const limit = annualizeCents(cents, operands.period);

  if (rule.operator === "lte") {
    if (money.max !== null && money.max <= limit) {
      return result(rule, "pass", "amount_within_published_limit", ctx);
    }
    if (money.min > limit) {
      return result(rule, "fail", "amount_outside_published_limit", ctx);
    }
    return result(rule, "unknown", "amount_range_spans_the_limit", ctx);
  }

  if (money.min >= limit) return result(rule, "pass", "amount_at_or_above_published_floor", ctx);
  if (money.max !== null && money.max < limit) {
    return result(rule, "fail", "amount_below_published_floor", ctx);
  }
  return result(rule, "unknown", "amount_range_spans_the_limit", ctx);
}

function evaluateRange(rule: Rule & { operator: "range" }, ctx: EvalContext): CriterionResult {
  const operands = rule.operands as unknown as {
    fieldId: string;
    minCents: number;
    maxCents: number | null;
    period: ThresholdPeriod;
    basis: string;
    taxYear?: number;
  };
  if (operands.period === "taxYear" && !taxYearMatches(operands.taxYear, ctx)) {
    return result(rule, "unknown", "tax_year_not_confirmed", ctx);
  }
  const money = readMoney(operands.fieldId, operands, ctx);
  if (!money.ok) return result(rule, "unknown", money.reasonCode, ctx);

  const floor = annualizeCents(operands.minCents, operands.period);
  const ceiling =
    operands.maxCents === null ? null : annualizeCents(operands.maxCents, operands.period);

  const wholelyInside =
    money.min >= floor && (ceiling === null || (money.max !== null && money.max <= ceiling));
  if (wholelyInside) return result(rule, "pass", "amount_within_published_range", ctx);

  const whollyOutside =
    (money.max !== null && money.max < floor) || (ceiling !== null && money.min > ceiling);
  if (whollyOutside) return result(rule, "fail", "amount_outside_published_range", ctx);

  return result(rule, "unknown", "amount_range_spans_the_limit", ctx);
}

function taxYearMatches(taxYear: number | undefined, ctx: EvalContext): boolean {
  if (taxYear === undefined) return false;
  const stated = ctx.extensions.eitc.taxYear;
  return stated !== null && stated === taxYear;
}

/* --------------------------------------------------------------- evaluation */

function evaluateRule(ruleId: string, ctx: EvalContext): CriterionResult {
  const cached = ctx.results.get(ruleId);
  if (cached !== undefined) return cached;

  const rule = ctx.byId.get(ruleId);
  if (rule === undefined) {
    const missingRule: CriterionResult = {
      id: ruleId,
      status: "unknown",
      evidenceIds: [],
      reasonCode: "rule_not_found",
      blocksLikely: true,
    };
    ctx.results.set(ruleId, missingRule);
    return missingRule;
  }

  if (ctx.visiting.has(ruleId)) {
    // The catalog validator rejects cycles; this keeps evaluation total anyway.
    return {
      id: ruleId,
      status: "unknown",
      evidenceIds: [...rule.evidenceIds],
      reasonCode: "rule_cycle",
      blocksLikely: true,
    };
  }
  ctx.visiting.add(ruleId);

  let criterion: CriterionResult;
  switch (rule.operator) {
    case "enumIn":
      criterion = evaluateEnumIn(rule, ctx);
      break;
    case "lte":
    case "gte":
      criterion = evaluateThreshold(rule, ctx);
      break;
    case "range":
      criterion = evaluateRange(rule, ctx);
      break;
    case "all":
    case "any": {
      const ruleIds: readonly string[] = rule.operands.ruleIds;
      const members = ruleIds.map((id) => evaluateRule(id, ctx));
      const status =
        rule.operator === "all"
          ? kleeneAll(members.map((m) => m.status))
          : kleeneAny(members.map((m) => m.status));

      criterion = result(
        rule,
        status,
        rule.operator === "all" ? "all_parts_considered" : "any_pathway_considered",
        ctx,
      );
      break;
    }
    case "referral":
      criterion = result(rule, "notApplicable", rule.operands.reasonCode, ctx);
      break;
  }

  // Exceptions can only soften a `fail`: a published limit is not an absolute
  // exclusion while a sourced exception may apply.
  if (criterion.status === "fail" && rule.exceptionRuleIds.length > 0) {
    const exceptions = rule.exceptionRuleIds.map((id) => evaluateRule(id, ctx));
    const softening = exceptions.find(
      (e) => e.status === "pass" || e.status === "unknown" || e.status === "notApplicable",
    );
    if (softening !== undefined) {
      criterion = result(
        rule,
        "unknown",
        softening.status === "pass" ? "exception_applies" : "exception_may_apply",
        ctx,
      );
    }
  }

  ctx.visiting.delete(ruleId);
  ctx.results.set(rule.id, criterion);
  return criterion;
}

/** True when the program version is in force on the injected evaluation date. */
export function programIsInForce(program: Program, evaluationDate: string): boolean {
  return isoDateInRange(evaluationDate, program.validFrom, program.validTo);
}

/**
 * Evaluates every top-level rule of one program. Top-level means a rule that no
 * other rule references, so a shared sub-rule is evaluated once and reported
 * once, in catalog order.
 */
export function screenProgram(input: ScreeningInput): ProgramScreening {
  const { program, facts, extensions, evaluationDate } = input;

  const byId = new Map(program.rules.map((r) => [r.id, r] as const));
  const referenced = new Set<string>();
  for (const rule of program.rules) {
    if (rule.operator === "all" || rule.operator === "any") {
      for (const id of rule.operands.ruleIds) referenced.add(id);
    }
    for (const id of rule.exceptionRuleIds) referenced.add(id);
  }

  const ctx: EvalContext = {
    byId,
    facts,
    extensions,
    results: new Map(),
    visiting: new Set(),
    missing: [],
  };

  if (!programIsInForce(program, evaluationDate)) {
    return {
      programId: program.id,
      applicable: false,
      criteria: [],
      missingFieldIds: [],
      evidenceIds: [],
      reasonIds: ["program_version_not_in_force"],
    };
  }

  const criteria = program.rules
    .filter((r) => !referenced.has(r.id))
    .map((r) => evaluateRule(r.id, ctx));

  const evidenceIds: string[] = [];
  for (const c of ctx.results.values()) {
    for (const id of c.evidenceIds) if (!evidenceIds.includes(id)) evidenceIds.push(id);
  }

  const reasonIds: string[] = [];
  for (const c of criteria) if (!reasonIds.includes(c.reasonCode)) reasonIds.push(c.reasonCode);

  return {
    programId: program.id,
    applicable: true,
    criteria,
    missingFieldIds: ctx.missing,
    evidenceIds,
    reasonIds,
  };
}

/** Evaluates several programs in catalog order. Pure and order-independent. */
export function screenPrograms(
  programs: readonly Program[],
  facts: Facts,
  extensions: ProgramExtensions,
  evaluationDate: string,
): readonly ProgramScreening[] {
  return programs.map((program) => screenProgram({ program, facts, extensions, evaluationDate }));
}
