/**
 * Labeled SNAP screening fixtures.
 *
 * Every case is synthetic. The expected label is the preliminary screening
 * label this app may show, never an eligibility decision. The screening engine
 * lands in a later task (P1-10); until then these cases are checked for shape,
 * for referencing rules that exist in the catalog, and for sitting on the
 * intended side of the published limits.
 */

import { baseExtensions, baseFacts, interval } from "./builders";
import type { Facts, Label, ProgramExtensions } from "@/shared/contracts";

export type SnapCase = {
  id: string;
  description: string;
  facts: Facts;
  extensions: ProgramExtensions;
  expectedLabel: Label;
  /** Rules that must drive the outcome, by catalog rule id. */
  decidingRuleIds: string[];
  /** Fields the screen should report as missing, by field id. */
  expectedMissingFieldIds: string[];
};

export const snapCases: SnapCase[] = [
  {
    id: "snap.clearly_under_limits",
    description: "Household of three in Texas well under the gross and net monthly limits.",
    facts: baseFacts({
      need: "food",
      state: "TX",
      foodHouseholdSize: 3,
      householdSize: 3,
      income: { interval: interval(1800, 1800), period: "monthly", basis: "gross" },
    }),
    extensions: baseExtensions({
      snap: { deductionsAssessed: "yes", countableNetMonthly: interval(1500, 1500) },
    }),
    expectedLabel: "likely",
    decidingRuleIds: ["rule.snap.state", "rule.snap.gross130", "rule.snap.net100"],
    expectedMissingFieldIds: [],
  },
  {
    id: "snap.just_under_gross_boundary",
    description: "Household of one one cent under the $1,696 gross monthly limit.",
    facts: baseFacts({
      need: "food",
      state: "TX",
      foodHouseholdSize: 1,
      householdSize: 1,
      income: {
        interval: { minCents: 169599, maxCents: 169599 },
        period: "monthly",
        basis: "gross",
      },
    }),
    extensions: baseExtensions({
      snap: {
        deductionsAssessed: "yes",
        countableNetMonthly: { minCents: 130400, maxCents: 130400 },
      },
    }),
    expectedLabel: "likely",
    decidingRuleIds: ["rule.snap.gross130", "rule.snap.net100"],
    expectedMissingFieldIds: [],
  },
  {
    id: "snap.just_over_gross_boundary",
    description:
      "Household of one one cent over the gross limit, with no older-adult or disability exception.",
    facts: baseFacts({
      need: "food",
      state: "TX",
      foodHouseholdSize: 1,
      householdSize: 1,
      income: {
        interval: { minCents: 169601, maxCents: 169601 },
        period: "monthly",
        basis: "gross",
      },
    }),
    extensions: baseExtensions({ snap: { olderOrDisabled: "no" } }),
    expectedLabel: "notAClearMatch",
    decidingRuleIds: ["rule.snap.gross130"],
    expectedMissingFieldIds: [],
  },
  {
    id: "snap.income_unknown",
    description: "Texas household that has not given an income figure yet.",
    facts: baseFacts({
      need: "food",
      state: "TX",
      foodHouseholdSize: 4,
      householdSize: 4,
      income: null,
    }),
    extensions: baseExtensions(),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.snap.gross130"],
    expectedMissingFieldIds: ["income"],
  },
  {
    id: "snap.older_or_disabled_over_gross",
    description:
      "Household of two over the gross limit that includes someone older or with a disability, so the gross limit is not a definitive exclusion.",
    facts: baseFacts({
      need: "food",
      state: "TX",
      foodHouseholdSize: 2,
      householdSize: 2,
      income: { interval: interval(2600, 2600), period: "monthly", basis: "gross" },
      ageBand: "65plus",
    }),
    extensions: baseExtensions({
      snap: { olderOrDisabled: "yes", deductionsAssessed: "no", countableNetMonthly: null },
    }),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.snap.gross130", "rule.snap.older_or_disabled", "rule.snap.net100"],
    expectedMissingFieldIds: ["snap.countableNetMonthly"],
  },
  {
    id: "snap.categorical_165_path",
    description:
      "Household of two over the gross limit but under the 165% column and already receiving TANF, so the categorical path keeps it open.",
    facts: baseFacts({
      need: "food",
      state: "TX",
      foodHouseholdSize: 2,
      householdSize: 2,
      income: { interval: interval(2500, 2500), period: "monthly", basis: "gross" },
      receivesTanf: "yes",
    }),
    extensions: baseExtensions({ snap: { snapExceptionStatus: "applies" } }),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.snap.gross130", "rule.snap.categorical165"],
    expectedMissingFieldIds: [],
  },
];
