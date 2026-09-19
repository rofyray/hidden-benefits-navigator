/**
 * Labeled Medicare cost-help fixtures. MSP and Extra Help are screened
 * separately: no fixture uses one pathway's outcome as evidence for the other.
 */

import { baseExtensions, baseFacts, interval } from "./builders";
import type { Facts, Label, ProgramExtensions } from "@/shared/contracts";

export type MedicareCase = {
  id: string;
  description: string;
  pathway: "msp" | "extraHelp";
  facts: Facts;
  extensions: ProgramExtensions;
  expectedLabel: Label;
  decidingRuleIds: string[];
  expectedMissingFieldIds: string[];
};

export const medicareCases: MedicareCase[] = [
  {
    id: "medicare.msp_qmb_individual_under_limits",
    description: "Individual with Medicare, countable income and resources under the QMB limits.",
    pathway: "msp",
    facts: baseFacts({ need: "medicare", state: "TX", ageBand: "65plus", medicarePartA: "yes" }),
    extensions: baseExtensions({
      medicare: {
        partBID: "yes",
        category: "individual",
        countableMonthly: interval(1200, 1200),
        countableResources: interval(4000, 4000),
        countableBasisConfirmed: "yes",
      },
    }),
    expectedLabel: "likely",
    decidingRuleIds: ["rule.medicare.msp_qmb_ind"],
    expectedMissingFieldIds: [],
  },
  {
    id: "medicare.msp_subprogram_boundary",
    description:
      "Individual at $1,500 a month: over the QMB limit, under the SLMB limit, so the subprogram boundary decides.",
    pathway: "msp",
    facts: baseFacts({ need: "medicare", state: "TX", ageBand: "65plus", medicarePartA: "yes" }),
    extensions: baseExtensions({
      medicare: {
        partBID: "yes",
        category: "individual",
        countableMonthly: interval(1500, 1500),
        countableResources: interval(4000, 4000),
        countableBasisConfirmed: "yes",
      },
    }),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.medicare.msp_qmb_income_ind", "rule.medicare.msp_slmb_income_ind"],
    expectedMissingFieldIds: [],
  },
  {
    id: "medicare.msp_resources_unknown",
    description:
      "Income clearly under the QMB limit but resources not stated: the resource check stays unknown rather than being assumed met.",
    pathway: "msp",
    facts: baseFacts({ need: "medicare", state: "TX", ageBand: "65plus", medicarePartA: "yes" }),
    extensions: baseExtensions({
      medicare: {
        partBID: "yes",
        category: "individual",
        countableMonthly: interval(900, 900),
        countableResources: null,
        countableBasisConfirmed: "yes",
      },
    }),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.medicare.msp_resources_ind"],
    expectedMissingFieldIds: ["medicare.countableResources"],
  },
  {
    id: "medicare.younger_not_enrolled",
    description:
      "A 52-year-old with low income who does not have Medicare: age alone neither enrolls nor disqualifies, and the missing enrollment fact decides.",
    pathway: "msp",
    facts: baseFacts({ need: "medicare", state: "TX", ageBand: "18to59", medicarePartA: "no" }),
    extensions: baseExtensions({
      medicare: {
        partBID: "no",
        category: "individual",
        countableMonthly: interval(800, 800),
        countableResources: interval(1000, 1000),
        countableBasisConfirmed: "yes",
      },
    }),
    expectedLabel: "notAClearMatch",
    decidingRuleIds: ["rule.medicare.enrolled"],
    expectedMissingFieldIds: [],
  },
  {
    id: "medicare.extra_help_automatic_via_ssi",
    description:
      "Person on SSI: Extra Help is automatic, and this says nothing about their Medicare Savings Program result.",
    pathway: "extraHelp",
    facts: baseFacts({
      need: "medicare",
      state: "TX",
      ageBand: "65plus",
      medicarePartA: "yes",
      receivesSsi: "yes",
    }),
    extensions: baseExtensions({
      medicare: {
        partBID: "yes",
        category: "individual",
        countableBasisConfirmed: "unknown",
        extraHelpAnnualIncome: null,
        extraHelpResources: null,
        extraHelpBasisConfirmed: "unknown",
      },
    }),
    expectedLabel: "likely",
    decidingRuleIds: ["rule.medicare.extra_help_automatic", "rule.medicare.extra_help_ssi"],
    expectedMissingFieldIds: [],
  },
  {
    id: "medicare.extra_help_over_msp_under",
    description:
      "Annual income of $22,000 — under the Extra Help limit — while monthly countable income is over the QMB limit: each pathway is decided on its own limits.",
    pathway: "extraHelp",
    facts: baseFacts({ need: "medicare", state: "TX", ageBand: "65plus", medicarePartA: "yes" }),
    extensions: baseExtensions({
      medicare: {
        partBID: "yes",
        category: "individual",
        countableMonthly: interval(1833, 1833),
        countableResources: interval(9000, 9000),
        countableBasisConfirmed: "yes",
        extraHelpAnnualIncome: interval(22000, 22000),
        extraHelpResources: interval(10000, 10000),
        extraHelpBasisConfirmed: "yes",
      },
    }),
    expectedLabel: "likely",
    decidingRuleIds: [
      "rule.medicare.extra_help_income_ind",
      "rule.medicare.extra_help_resources_ind",
    ],
    expectedMissingFieldIds: [],
  },
];
