import { baseExtensions, baseFacts } from "./builders";
import type { Facts, ProgramExtensions } from "../../src/shared/contracts";

export type WicCase = {
  readonly id: string;
  readonly description: string;
  readonly facts: Facts;
  readonly extensions: ProgramExtensions;
  /** Pathway under test: category, income table, or the categorical (program) income route. */
  readonly pathway: "category" | "incomeTable" | "categoricalIncome";
  readonly expectedLabel: "likely" | "possibly" | "notAClearMatch";
  readonly note: string;
};

export const wicCases: readonly WicCase[] = [
  {
    id: "wic.pregnant_under_income",
    description: "Pregnant, household of 2, $2,900 a month gross",
    facts: baseFacts({
      need: "food",
      state: "TX",
      householdSize: 2,
      income: {
        interval: { minCents: 290000, maxCents: 290000 },
        period: "monthly",
        basis: "gross",
      },
      pregnant: "yes",
    }),
    extensions: baseExtensions({
      wic: { applicableHouseholdSize: 2, expectedInfants: 1, householdBasisConfirmed: "yes" },
    }),
    pathway: "incomeTable",
    expectedLabel: "likely",
    note: "Category met and income under the published size-2 figure of $3,337.",
  },
  {
    id: "wic.child_over_income",
    description: "Child under 5, household of 3, $5,000 a month gross",
    facts: baseFacts({
      need: "food",
      state: "TX",
      householdSize: 3,
      income: {
        interval: { minCents: 500000, maxCents: 500000 },
        period: "monthly",
        basis: "gross",
      },
      childUnder5: "yes",
    }),
    extensions: baseExtensions({
      wic: { applicableHouseholdSize: 3, expectedInfants: null, householdBasisConfirmed: "yes" },
    }),
    pathway: "incomeTable",
    expectedLabel: "notAClearMatch",
    note: "Above the published size-3 figure of $4,212 with no categorical program route.",
  },
  {
    id: "wic.snap_categorical_income",
    description: "Breastfeeding a 4-month-old, already on SNAP, income not stated",
    facts: baseFacts({
      need: "food",
      state: "TX",
      householdSize: 3,
      breastfeedingUnder12Months: "yes",
      receivesSnap: "yes",
    }),
    extensions: baseExtensions({
      wic: {
        applicableHouseholdSize: 3,
        expectedInfants: null,
        householdBasisConfirmed: "unknown",
      },
    }),
    pathway: "categoricalIncome",
    expectedLabel: "likely",
    note: "SNAP already meets the WIC income guidelines, so the unstated income does not block.",
  },
  {
    id: "wic.no_category_stated",
    description: "Low income, no category stated",
    facts: baseFacts({
      need: "food",
      state: "TX",
      householdSize: 2,
      income: {
        interval: { minCents: 200000, maxCents: 200000 },
        period: "monthly",
        basis: "gross",
      },
    }),
    extensions: baseExtensions({
      wic: { applicableHouseholdSize: 2, expectedInfants: null, householdBasisConfirmed: "yes" },
    }),
    pathway: "category",
    expectedLabel: "possibly",
    note: "No category stated; the app never infers pregnancy, so this stays unknown, not a no.",
  },
  {
    id: "wic.postpartum_boundary",
    description: "Gave birth 7 months ago, not breastfeeding, no child under 5 stated",
    facts: baseFacts({
      need: "food",
      state: "TX",
      householdSize: 2,
      income: {
        interval: { minCents: 200000, maxCents: 200000 },
        period: "monthly",
        basis: "gross",
      },
      postpartumUnder6Months: "no",
      breastfeedingUnder12Months: "no",
      childUnder5: "unknown",
    }),
    extensions: baseExtensions({
      wic: { applicableHouseholdSize: 2, expectedInfants: null, householdBasisConfirmed: "yes" },
    }),
    pathway: "category",
    expectedLabel: "possibly",
    note: "Past the 6-month postpartum duration, but a child under 5 is unknown — the infant may still qualify.",
  },
  {
    id: "wic.large_household_referral",
    description: "Pregnant with twins, household of 8",
    facts: baseFacts({
      need: "food",
      state: "TX",
      householdSize: 6,
      income: {
        interval: { minCents: 700000, maxCents: 700000 },
        period: "monthly",
        basis: "gross",
      },
      pregnant: "yes",
    }),
    extensions: baseExtensions({
      wic: { applicableHouseholdSize: 8, expectedInfants: 2, householdBasisConfirmed: "yes" },
    }),
    pathway: "incomeTable",
    expectedLabel: "possibly",
    note: "Beyond the published table of six, so the clinic decides — a referral, never a no.",
  },
];
