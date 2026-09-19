import { baseExtensions, baseFacts } from "./builders";
import type { Facts, ProgramExtensions } from "../../src/shared/contracts";

export type LifelineCase = {
  readonly id: string;
  readonly description: string;
  readonly facts: Facts;
  readonly extensions: ProgramExtensions;
  readonly pathway: "participation" | "income" | "duplicate" | "household";
  readonly expectedLabel: "likely" | "possibly" | "notAClearMatch";
  readonly note: string;
};

export const lifelineCases: readonly LifelineCase[] = [
  {
    id: "lifeline.snap_enrolled",
    description: "Already enrolled in SNAP, no Lifeline yet",
    facts: baseFacts({
      need: "phone",
      state: "TX",
      householdSize: 3,
      receivesSnap: "yes",
      existingLifeline: "no",
    }),
    extensions: baseExtensions({
      lifeline: {
        economicHouseholdSize: 3,
        householdBasisConfirmed: "yes",
        specialPathwayReviewNeeded: "no",
      },
    }),
    pathway: "participation",
    expectedLabel: "likely",
    note: "Actual SNAP enrollment, stated by the person, is a participation route.",
  },
  {
    id: "lifeline.snap_predicted_not_enrolled",
    description: "This app suggests SNAP may be a match, but the person is not enrolled",
    facts: baseFacts({
      need: "phone",
      state: "TX",
      householdSize: 3,
      receivesSnap: "no",
      existingLifeline: "no",
    }),
    extensions: baseExtensions({
      lifeline: {
        economicHouseholdSize: 3,
        householdBasisConfirmed: "yes",
        specialPathwayReviewNeeded: "no",
      },
    }),
    pathway: "participation",
    expectedLabel: "possibly",
    note: "A predicted SNAP match is never enrollment; with income unstated this cannot reach likely.",
  },
  {
    id: "lifeline.income_under_limit",
    description: "Household of 4, $40,000 a year, no listed program",
    facts: baseFacts({
      need: "phone",
      state: "TX",
      householdSize: 4,
      income: {
        interval: { minCents: 4000000, maxCents: 4000000 },
        period: "annual",
        basis: "gross",
      },
      receivesSnap: "no",
      receivesMedicaid: "no",
      existingLifeline: "no",
    }),
    extensions: baseExtensions({
      lifeline: {
        economicHouseholdSize: 4,
        householdBasisConfirmed: "yes",
        specialPathwayReviewNeeded: "no",
      },
    }),
    pathway: "income",
    expectedLabel: "likely",
    note: "Under the published size-4 limit of $44,550.",
  },
  {
    id: "lifeline.income_just_over_limit",
    description: "Household of 1, $21,600 a year",
    facts: baseFacts({
      need: "phone",
      state: "TX",
      householdSize: 1,
      income: {
        interval: { minCents: 2160000, maxCents: 2160000 },
        period: "annual",
        basis: "gross",
      },
      receivesSnap: "no",
      receivesMedicaid: "no",
      receivesSsi: "no",
      receivesHousingAid: "no",
      receivesVeteransPension: "no",
      existingLifeline: "no",
    }),
    extensions: baseExtensions({
      lifeline: {
        economicHouseholdSize: 1,
        householdBasisConfirmed: "yes",
        specialPathwayReviewNeeded: "no",
      },
    }),
    pathway: "income",
    expectedLabel: "notAClearMatch",
    note: "$54 over the published size-1 limit of $21,546, with every participation route stated as no.",
  },
  {
    id: "lifeline.already_has_benefit",
    description: "Someone in the household already has a Lifeline discount",
    facts: baseFacts({
      need: "phone",
      state: "TX",
      householdSize: 2,
      receivesMedicaid: "yes",
      existingLifeline: "yes",
    }),
    extensions: baseExtensions({
      lifeline: {
        economicHouseholdSize: 2,
        householdBasisConfirmed: "yes",
        specialPathwayReviewNeeded: "no",
      },
    }),
    pathway: "duplicate",
    expectedLabel: "notAClearMatch",
    note: "One Lifeline benefit per household; the qualifying program does not override that.",
  },
  {
    id: "lifeline.household_basis_unclear",
    description: "Shares an address with roommates, income near the ninth-person limit",
    facts: baseFacts({
      need: "phone",
      state: "TX",
      householdSize: 9,
      income: {
        interval: { minCents: 8000000, maxCents: 8500000 },
        period: "annual",
        basis: "gross",
      },
      existingLifeline: "unknown",
    }),
    extensions: baseExtensions({
      lifeline: {
        economicHouseholdSize: 9,
        householdBasisConfirmed: "unknown",
        specialPathwayReviewNeeded: "no",
      },
    }),
    pathway: "household",
    expectedLabel: "possibly",
    note: "Size 9 uses the published per-person increment ($82,890), but who counts as the economic household is the program's call.",
  },
];
