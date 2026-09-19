/**
 * Labeled EITC screening fixtures. All values are synthetic and no fixture
 * contains a Social Security number. Expected labels are preliminary screening
 * labels, never a statement that the IRS will allow the credit.
 */

import { baseExtensions, baseFacts, interval } from "./builders";
import type { Facts, Label, ProgramExtensions } from "@/shared/contracts";

export type EitcCase = {
  id: string;
  description: string;
  facts: Facts;
  extensions: ProgramExtensions;
  expectedLabel: Label;
  decidingRuleIds: string[];
  expectedMissingFieldIds: string[];
};

export const eitcCases: EitcCase[] = [
  {
    id: "eitc.one_child_head_of_household_under_limit",
    description: "Head of household with one qualifying child and AGI well under the 2025 limit.",
    facts: baseFacts({ need: "tax", state: "TX", householdSize: 2 }),
    extensions: baseExtensions({
      eitc: {
        taxYear: 2025,
        filingStatus: "headOfHousehold",
        agiAnnual: interval(28000, 28000),
        earnedAnnual: interval(28000, 28000),
        qualifyingChildrenCount: 1,
        investmentIncomeWithinLimit: "yes",
      },
    }),
    expectedLabel: "likely",
    decidingRuleIds: ["rule.eitc.taxyear2025", "rule.eitc.agi_single_0", "rule.eitc.earned_income"],
    expectedMissingFieldIds: [],
  },
  {
    id: "eitc.joint_limit_differs_from_single",
    description:
      "Two children and AGI of $60,000: over the single-filer limit but under the married-filing-jointly limit, so filing status decides.",
    facts: baseFacts({ need: "tax", state: "TX", householdSize: 4 }),
    extensions: baseExtensions({
      eitc: {
        taxYear: 2025,
        filingStatus: "joint",
        agiAnnual: interval(60000, 60000),
        earnedAnnual: interval(60000, 60000),
        qualifyingChildrenCount: 2,
        investmentIncomeWithinLimit: "yes",
      },
    }),
    expectedLabel: "likely",
    decidingRuleIds: ["rule.eitc.agi_joint"],
    expectedMissingFieldIds: [],
  },
  {
    id: "eitc.child_count_changes_outcome",
    description:
      "Single filer with AGI of $52,000: over the one-child limit, under the two-child limit.",
    facts: baseFacts({ need: "tax", state: "TX", householdSize: 3 }),
    extensions: baseExtensions({
      eitc: {
        taxYear: 2025,
        filingStatus: "single",
        agiAnnual: interval(52000, 52000),
        earnedAnnual: interval(52000, 52000),
        qualifyingChildrenCount: 2,
        investmentIncomeWithinLimit: "yes",
      },
    }),
    expectedLabel: "likely",
    decidingRuleIds: ["rule.eitc.agi_single_0"],
    expectedMissingFieldIds: [],
  },
  {
    id: "eitc.childless_too_young",
    description: "Single filer with no children who is not yet 25, so the age rule is not met.",
    facts: baseFacts({ need: "tax", state: "TX", householdSize: 1, ageBand: "18to59" }),
    extensions: baseExtensions({
      eitc: {
        taxYear: 2025,
        filingStatus: "single",
        agiAnnual: interval(12000, 12000),
        earnedAnnual: interval(12000, 12000),
        qualifyingChildrenCount: 0,
        childlessAge25to64: "no",
        investmentIncomeWithinLimit: "yes",
      },
    }),
    expectedLabel: "notAClearMatch",
    decidingRuleIds: ["rule.eitc.childless_age"],
    expectedMissingFieldIds: [],
  },
  {
    id: "eitc.tax_year_unknown",
    description: "No tax year stated, so the screen cannot pick a published table.",
    facts: baseFacts({ need: "tax", state: "TX", householdSize: 1 }),
    extensions: baseExtensions({
      eitc: {
        taxYear: null,
        filingStatus: "single",
        agiAnnual: interval(20000, 20000),
        qualifyingChildrenCount: 1,
      },
    }),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.eitc.taxyear2025"],
    expectedMissingFieldIds: ["eitc.taxYear"],
  },
  {
    id: "eitc.special_rule_referral",
    description:
      "Clergy member whose situation falls under the special qualifying rules, so the screen refers rather than scoring.",
    facts: baseFacts({ need: "tax", state: "TX", householdSize: 2, employment: "other" }),
    extensions: baseExtensions({
      eitc: {
        taxYear: 2025,
        filingStatus: "single",
        agiAnnual: interval(30000, 30000),
        earnedAnnual: interval(30000, 30000),
        qualifyingChildrenCount: 1,
        specialRuleApplies: "yes",
      },
    }),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.eitc.special_rules_referral"],
    expectedMissingFieldIds: [],
  },
];
