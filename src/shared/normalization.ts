/**
 * Pure normalization helpers shared by the browser and the server.
 *
 * Everything here is integer arithmetic on cents. Nothing converts a period by
 * dividing, because dividing $1,000/month into a weekly figure loses cents and
 * then a boundary case lands on the wrong side of a published limit. Instead,
 * two amounts are compared by scaling both to the same annual basis with the
 * published periods-per-year factors, which keeps every comparison exact.
 */

import type { Facts, MoneyInterval, ProgramExtensions } from "./contracts";

export type ThresholdPeriod =
  "weekly" | "biweekly" | "semimonthly" | "monthly" | "annual" | "taxYear";

export type IncomePeriod = Exclude<ThresholdPeriod, "taxYear">;

/**
 * Periods per year. "Twice monthly" (semimonthly, 24) is deliberately distinct
 * from "every two weeks" (biweekly, 26); conflating them is a known way to
 * misjudge a limit by a whole period.
 */
export const PERIODS_PER_YEAR: Readonly<Record<IncomePeriod, number>> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  annual: 1,
};

/** A tax-year figure is an annual figure; the tax year itself is matched separately. */
export function periodsPerYear(period: ThresholdPeriod): number {
  return period === "taxYear" ? 1 : PERIODS_PER_YEAR[period];
}

/** Exact annualized cents. Safe for every amount the contracts admit. */
export function annualizeCents(cents: number, period: ThresholdPeriod): number {
  return cents * periodsPerYear(period);
}

/** Exact annualized endpoints of an interval; a null max stays open-ended. */
export function annualEndpoints(
  interval: MoneyInterval,
  period: ThresholdPeriod,
): { min: number; max: number | null } {
  return {
    min: annualizeCents(interval.minCents, period),
    max: interval.maxCents === null ? null : annualizeCents(interval.maxCents, period),
  };
}

export type IntervalComparison = "below" | "atOrBelow" | "above" | "overlaps" | "unknown";

/**
 * Compares an interval against a threshold, both annualized first.
 *
 * `atOrBelow` means the whole interval satisfies a "≤ limit" rule, `above`
 * means the whole interval is beyond it, and `overlaps` means the answer
 * genuinely depends on a number nobody has yet — which stays unknown rather
 * than being resolved by picking an endpoint.
 */
export function compareIntervalToThreshold(
  interval: MoneyInterval,
  intervalPeriod: ThresholdPeriod,
  thresholdCents: number,
  thresholdPeriod: ThresholdPeriod,
): IntervalComparison {
  const min = annualizeCents(interval.minCents, intervalPeriod);
  const max = interval.maxCents === null ? null : annualizeCents(interval.maxCents, intervalPeriod);
  const limit = annualizeCents(thresholdCents, thresholdPeriod);

  if (min > limit) return "above";
  if (max === null) return "overlaps";
  if (max <= limit) return min < limit ? "below" : "atOrBelow";
  return "overlaps";
}

/** True when a claimed income basis can be measured against a published basis. */
export function basisIsComparable(
  factBasis: "gross" | "net" | "unknown",
  thresholdBasis: "gross" | "net" | "countable" | "unknown",
): boolean {
  if (factBasis === "unknown" || thresholdBasis === "unknown") return false;
  return factBasis === thresholdBasis;
}

export type FieldValue =
  | { kind: "absent" }
  | { kind: "tri"; value: "yes" | "no" | "unknown" }
  | { kind: "enum"; value: string | null }
  | { kind: "number"; value: number | null }
  | {
      kind: "money";
      interval: MoneyInterval | null;
      period: IncomePeriod | null;
      basis: "gross" | "net" | "unknown";
    };

const TRI_VALUES = new Set(["yes", "no", "unknown"]);

/**
 * Resolves a catalog field id ("income", "wic.applicableHouseholdSize") against
 * the facts and program extensions. Nothing is inferred and nothing defaults:
 * an absent field is reported as absent so the caller records `unknown`.
 */
export function resolveField(
  fieldId: string,
  facts: Facts,
  extensions: ProgramExtensions,
): FieldValue {
  const [head, tail] = fieldId.includes(".")
    ? (fieldId.split(".", 2) as [string, string])
    : [fieldId, undefined];

  const container: Record<string, unknown> =
    tail === undefined
      ? (facts as unknown as Record<string, unknown>)
      : ((extensions as unknown as Record<string, Record<string, unknown>>)[head] ?? {});
  const key = tail ?? head;
  if (!(key in container)) return { kind: "absent" };
  const raw = container[key];

  if (raw === null) {
    if (
      key === "income" ||
      key.endsWith("Annual") ||
      key.endsWith("Monthly") ||
      key.endsWith("Resources")
    ) {
      return { kind: "money", interval: null, period: null, basis: "unknown" };
    }
    return { kind: "enum", value: null };
  }
  if (typeof raw === "number") return { kind: "number", value: raw };
  if (typeof raw === "string") {
    return TRI_VALUES.has(raw)
      ? { kind: "tri", value: raw as "yes" | "no" | "unknown" }
      : { kind: "enum", value: raw };
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if ("interval" in obj) {
      return {
        kind: "money",
        interval: obj["interval"] as MoneyInterval,
        period: obj["period"] as IncomePeriod,
        basis: obj["basis"] as "gross" | "net" | "unknown",
      };
    }
    if ("minCents" in obj) {
      // A bare interval (an extension band) carries no period or basis of its
      // own; the rule that reads it supplies them and confirms the basis.
      return {
        kind: "money",
        interval: obj as unknown as MoneyInterval,
        period: null,
        basis: "unknown",
      };
    }
  }
  return { kind: "absent" };
}

/** ISO calendar-date comparison that never touches a time zone. */
export function isoDateInRange(date: string, from: string | null, to: string | null): boolean {
  if (from !== null && date < from) return false;
  if (to !== null && date > to) return false;
  return true;
}
