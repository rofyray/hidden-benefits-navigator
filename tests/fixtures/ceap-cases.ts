/**
 * Labeled CEAP fixtures. Because the Texas income guidelines could not be
 * retrieved, no fixture expects a `likely` label: the highest honest outcome
 * is a referral to the local agency.
 */

import { baseExtensions, baseFacts, interval } from "./builders";
import type { Facts, Label, ProgramExtensions } from "@/shared/contracts";

export type CeapCase = {
  id: string;
  description: string;
  facts: Facts;
  extensions: ProgramExtensions;
  expectedLabel: Label;
  decidingRuleIds: string[];
  expectedMissingFieldIds: string[];
};

export const ceapCases: CeapCase[] = [
  {
    id: "ceap.low_income_bill_holder",
    description: "Texas household with a low income that pays its own electric bill.",
    facts: baseFacts({
      need: "utilities",
      state: "TX",
      householdSize: 3,
      income: { interval: interval(1800, 1800), period: "monthly", basis: "gross" },
    }),
    extensions: baseExtensions({
      ceap: {
        utilityResponsibility: "yes",
        needsHeatingCoolingHelp: "yes",
        householdDefinitionConfirmed: "yes",
      },
    }),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.ceap.local_referral"],
    expectedMissingFieldIds: [],
  },
  {
    id: "ceap.high_income_still_referred",
    description:
      "Higher income household: without a verified income table the screen still refers rather than ruling anyone out on income.",
    facts: baseFacts({
      need: "utilities",
      state: "TX",
      householdSize: 2,
      income: { interval: interval(9000, 9000), period: "monthly", basis: "gross" },
    }),
    extensions: baseExtensions({
      ceap: {
        utilityResponsibility: "yes",
        needsHeatingCoolingHelp: "yes",
        householdDefinitionConfirmed: "yes",
      },
    }),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.ceap.local_referral"],
    expectedMissingFieldIds: [],
  },
  {
    id: "ceap.income_unknown",
    description: "Income not stated; the card behaves the same because income is not scored.",
    facts: baseFacts({ need: "utilities", state: "TX", householdSize: 1, income: null }),
    extensions: baseExtensions({
      ceap: {
        utilityResponsibility: "yes",
        needsHeatingCoolingHelp: "unknown",
        householdDefinitionConfirmed: "unknown",
      },
    }),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.ceap.local_referral"],
    expectedMissingFieldIds: [],
  },
  {
    id: "ceap.no_utility_responsibility",
    description: "Energy costs are included in rent and not billed to the household.",
    facts: baseFacts({ need: "utilities", state: "TX", householdSize: 2 }),
    extensions: baseExtensions({
      ceap: {
        utilityResponsibility: "no",
        needsHeatingCoolingHelp: "no",
        householdDefinitionConfirmed: "yes",
      },
    }),
    expectedLabel: "notAClearMatch",
    decidingRuleIds: ["rule.ceap.utility_responsibility"],
    expectedMissingFieldIds: [],
  },
  {
    id: "ceap.utility_responsibility_unknown",
    description: "Not sure who the bill is in; the card keeps the door open and asks the agency.",
    facts: baseFacts({ need: "utilities", state: "TX", householdSize: 4 }),
    extensions: baseExtensions({
      ceap: {
        utilityResponsibility: "unknown",
        needsHeatingCoolingHelp: "yes",
        householdDefinitionConfirmed: "unknown",
      },
    }),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.ceap.local_referral", "rule.ceap.utility_responsibility"],
    expectedMissingFieldIds: ["ceap.utilityResponsibility"],
  },
  {
    id: "ceap.state_unknown",
    description:
      "State not stated, and no county is collected, so the route is the statewide referral line rather than a named local office.",
    facts: baseFacts({ need: "utilities", state: null, householdSize: 2 }),
    extensions: baseExtensions({
      ceap: {
        utilityResponsibility: "yes",
        needsHeatingCoolingHelp: "yes",
        householdDefinitionConfirmed: "unknown",
      },
    }),
    expectedLabel: "possibly",
    decidingRuleIds: ["rule.ceap.state"],
    expectedMissingFieldIds: ["state"],
  },
];
