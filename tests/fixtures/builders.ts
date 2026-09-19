/**
 * Typed fixture builders.
 *
 * Every builder starts from a fully unknown baseline, so a fixture only asserts
 * what it deliberately sets. All values are synthetic.
 */

import {
  factsSchema,
  programExtensionsSchema,
  type Facts,
  type MoneyInterval,
  type ProgramExtensions,
} from "@/shared/contracts";
import type { Program, Source } from "@/shared/catalog-schema";

export function cents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function interval(minDollars: number, maxDollars: number | null): MoneyInterval {
  return { minCents: cents(minDollars), maxCents: maxDollars === null ? null : cents(maxDollars) };
}

export function baseFacts(overrides: Partial<Facts> = {}): Facts {
  const base: Facts = {
    need: "unspecified",
    state: null,
    householdSize: null,
    foodHouseholdSize: null,
    income: null,
    ageBand: null,
    employment: null,
    medicarePartA: "unknown",
    pregnant: "unknown",
    postpartumUnder6Months: "unknown",
    breastfeedingUnder12Months: "unknown",
    childUnder5: "unknown",
    receivesSnap: "unknown",
    receivesMedicaid: "unknown",
    receivesSsi: "unknown",
    receivesTanf: "unknown",
    receivesHousingAid: "unknown",
    receivesVeteransPension: "unknown",
    existingLifeline: "unknown",
    sharesFood: "unknown",
    resourcesKnown: "unknown",
  };
  return factsSchema.parse({ ...base, ...overrides });
}

export function baseExtensions(
  overrides: Partial<{
    [K in keyof ProgramExtensions]: Partial<ProgramExtensions[K]>;
  }> = {},
): ProgramExtensions {
  const base: ProgramExtensions = {
    snap: {
      olderOrDisabled: "unknown",
      snapExceptionStatus: "unknown",
      deductionsAssessed: "unknown",
      countableNetMonthly: null,
    },
    eitc: {
      taxYear: null,
      filingStatus: "unknown",
      earnedAnnual: null,
      agiAnnual: null,
      qualifyingChildrenCount: null,
      investmentIncomeWithinLimit: "unknown",
      childlessAge25to64: "unknown",
      specialRuleApplies: "unknown",
      childlessResidenceAndDependencyChecks: "unknown",
    },
    ceap: {
      utilityResponsibility: "unknown",
      needsHeatingCoolingHelp: "unknown",
      householdDefinitionConfirmed: "unknown",
    },
    medicare: {
      partBID: "unknown",
      category: "unknown",
      countableMonthly: null,
      countableResources: null,
      countableBasisConfirmed: "unknown",
      receivesOtherMedicaid: "unknown",
      receivesMsp: "unknown",
      receivesFullMedicaid: "unknown",
      extraHelpAnnualIncome: null,
      extraHelpResources: null,
      extraHelpBasisConfirmed: "unknown",
      specialPathwayReviewNeeded: "unknown",
    },
    wic: {
      applicableHouseholdSize: null,
      expectedInfants: null,
      householdBasisConfirmed: "unknown",
    },
    lifeline: {
      economicHouseholdSize: null,
      householdBasisConfirmed: "unknown",
      specialPathwayReviewNeeded: "unknown",
    },
  };
  const merged = Object.fromEntries(
    Object.entries(base).map(([key, value]) => [
      key,
      { ...value, ...(overrides as Record<string, object>)[key] },
    ]),
  );
  return programExtensionsSchema.parse(merged);
}

export function synthSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "src.synthetic",
    url: "https://example.gov/synthetic",
    publisher: "Synthetic Agency",
    title: "Synthetic source",
    retrievedOn: "2026-09-19",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    section: "Synthetic section",
    reviewStatus: "verified",
    ...overrides,
  };
}

export function synthProgram(overrides: Partial<Program> = {}): Program {
  const program = {
    id: "snap",
    name: "Synthetic program",
    jurisdiction: "TX",
    version: "0.1.0",
    status: "published",
    validFrom: "2026-01-01",
    validTo: null,
    reviewDueOn: "2099-01-01",
    coverage: "Synthetic coverage statement.",
    limitations: [],
    eligibilitySummary: ["Synthetic sentence one.", "Synthetic sentence two."],
    evidence: [
      {
        id: "ev.income",
        text: "Synthetic income evidence.",
        sourceIds: ["src.synthetic"],
        kind: "eligibility",
      },
    ],
    rules: [
      {
        id: "rule.income",
        fieldIds: ["income"],
        evidenceIds: ["ev.income"],
        operator: "lte",
        operands: {
          fieldId: "income",
          amountCents: cents(1000),
          householdScale: null,
          currency: "USD",
          period: "monthly",
          basis: "gross",
        },
        effect: "screening",
        exceptionRuleIds: [],
        blocksLikelyWhenUnknown: true,
      },
    ],
    requiredFieldIds: ["income"],
    optionalFieldIds: [],
    value: {
      kind: "variable",
      text: "The amount depends on your household and income.",
      evidenceIds: ["ev.income"],
      period: "month",
    },
    documents: [],
    application: [
      {
        id: "app.start",
        label: "Open the official page",
        url: "https://example.gov/apply",
        evidenceIds: ["ev.income"],
      },
    ],
    fallbackExplanation: "Synthetic fallback explanation.",
    fallbackChecklistIds: ["app.start"],
    ...overrides,
  } as Program;
  return program;
}
