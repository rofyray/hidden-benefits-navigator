/**
 * Plain-language descriptors for every reviewable fact.
 *
 * The form is generated from these descriptors rather than hand-built, so a new
 * contract field cannot quietly become unreviewable: it shows up here or it is
 * visibly missing. Every descriptor carries an explicit unknown option, because
 * a person must always be able to say "I don't know" instead of guessing, and
 * nothing here decides eligibility — these are only labels and input shapes.
 */

import type { ExtractionGroup } from "@/shared/extraction-schema";

export type FieldKind = "tri" | "enum" | "household" | "count" | "money" | "income";

export type FieldOption = { value: string; label: string };

export type FieldDescriptor = {
  /** `need` for a common fact, `snap.olderOrDisabled` for a program field. */
  path: string;
  label: string;
  help?: string;
  kind: FieldKind;
  options?: readonly FieldOption[];
  /** `null` for a fact every program uses. */
  group: ExtractionGroup | null;
  max?: number;
};

const TRI: readonly FieldOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "I don't know" },
];

function tri(path: string, label: string, group: ExtractionGroup | null = null, help?: string) {
  return { path, label, kind: "tri" as const, options: TRI, group, ...(help ? { help } : {}) };
}

function enumField(
  path: string,
  label: string,
  options: readonly FieldOption[],
  group: ExtractionGroup | null = null,
  help?: string,
): FieldDescriptor {
  return { path, label, kind: "enum", options, group, ...(help ? { help } : {}) };
}

export const COMMON_FIELDS: readonly FieldDescriptor[] = [
  enumField("need", "What you need help with", [
    { value: "food", label: "Food" },
    { value: "tax", label: "Taxes" },
    { value: "utilities", label: "Electricity or gas bills" },
    { value: "medicare", label: "Medicare costs" },
    { value: "phone", label: "Phone or internet" },
    { value: "unspecified", label: "Not sure yet" },
  ]),
  enumField("state", "Where you live", [
    { value: "TX", label: "Texas" },
    { value: "other", label: "Another state" },
    { value: "", label: "I don't know" },
  ]),
  { path: "householdSize", label: "People in your household", kind: "household", group: null },
  {
    path: "foodHouseholdSize",
    label: "People you buy and cook food with",
    help: "This can be smaller than your household.",
    kind: "household",
    group: null,
  },
  {
    path: "income",
    label: "Money coming in",
    help: "A range is fine. Leave it empty if you don't know.",
    kind: "income",
    group: null,
  },
  enumField("ageBand", "Your age", [
    { value: "under18", label: "Under 18" },
    { value: "18to59", label: "18 to 59" },
    { value: "60to64", label: "60 to 64" },
    { value: "65plus", label: "65 or older" },
    { value: "", label: "I don't know" },
  ]),
  enumField("employment", "Your work situation", [
    { value: "employed", label: "Working for an employer" },
    { value: "selfEmployed", label: "Self-employed" },
    { value: "unemployed", label: "Not working" },
    { value: "retired", label: "Retired" },
    { value: "other", label: "Something else" },
    { value: "", label: "I don't know" },
  ]),
  tri("medicarePartA", "You have Medicare Part A"),
  tri("pregnant", "You are pregnant"),
  tri("postpartumUnder6Months", "You gave birth in the last 6 months"),
  tri("breastfeedingUnder12Months", "You are breastfeeding a baby under 1"),
  tri("childUnder5", "A child under 5 lives with you"),
  tri("receivesSnap", "You already get SNAP (food benefits)"),
  tri("receivesMedicaid", "You already get Medicaid"),
  tri("receivesSsi", "You already get SSI"),
  tri("receivesTanf", "You already get TANF"),
  tri("receivesHousingAid", "You already get housing help"),
  tri("receivesVeteransPension", "You get a veterans pension or survivor benefit"),
  tri("existingLifeline", "Someone in your home already gets a phone or internet discount"),
  tri("sharesFood", "You share food costs with other people here"),
  tri("resourcesKnown", "You know roughly what your savings add up to"),
];

export const GROUP_FIELDS: Readonly<Record<ExtractionGroup, readonly FieldDescriptor[]>> = {
  snap: [
    tri("snap.olderOrDisabled", "Someone here is 60 or older, or has a disability", "snap"),
    enumField(
      "snap.snapExceptionStatus",
      "A special SNAP rule applies to your household",
      [
        { value: "applies", label: "Yes" },
        { value: "doesNotApply", label: "No" },
        { value: "unknown", label: "I don't know" },
      ],
      "snap",
    ),
    tri("snap.deductionsAssessed", "Someone has already worked out your deductions", "snap"),
    {
      path: "snap.countableNetMonthly",
      label: "Monthly income after deductions",
      kind: "money",
      group: "snap",
    },
  ],
  eitc: [
    { path: "eitc.taxYear", label: "Tax year", kind: "count", group: "eitc", max: 2100 },
    enumField(
      "eitc.filingStatus",
      "How you file your taxes",
      [
        { value: "single", label: "Single" },
        { value: "headOfHousehold", label: "Head of household" },
        { value: "joint", label: "Married, filing together" },
        { value: "separate", label: "Married, filing separately" },
        { value: "survivingSpouse", label: "Surviving spouse" },
        { value: "unknown", label: "I don't know" },
      ],
      "eitc",
    ),
    {
      path: "eitc.earnedAnnual",
      label: "Money earned from work last year",
      kind: "money",
      group: "eitc",
    },
    { path: "eitc.agiAnnual", label: "Total income on your return", kind: "money", group: "eitc" },
    {
      path: "eitc.qualifyingChildrenCount",
      label: "Children who could count on your return",
      kind: "count",
      group: "eitc",
      max: 3,
    },
    tri("eitc.investmentIncomeWithinLimit", "Investment income is small or none", "eitc"),
    tri(
      "eitc.childlessAge25to64",
      "You are between 25 and 64 with no children on the return",
      "eitc",
    ),
    tri("eitc.specialRuleApplies", "A special tax rule applies to you", "eitc"),
    tri(
      "eitc.childlessResidenceAndDependencyChecks",
      "You lived in the US most of the year and nobody claims you",
      "eitc",
    ),
  ],
  ceap: [
    tri("ceap.utilityResponsibility", "The electricity or gas bill is in your name", "ceap"),
    tri("ceap.needsHeatingCoolingHelp", "You need help with heating or cooling", "ceap"),
    tri(
      "ceap.householdDefinitionConfirmed",
      "You have checked who counts in your household",
      "ceap",
    ),
  ],
  medicare: [
    tri("medicare.partBID", "You have or want Medicare Part B", "medicare"),
    enumField(
      "medicare.category",
      "Who the application is for",
      [
        { value: "individual", label: "Just me" },
        { value: "couple", label: "Me and my spouse" },
        { value: "unknown", label: "I don't know" },
      ],
      "medicare",
    ),
    {
      path: "medicare.countableMonthly",
      label: "Monthly income that counts",
      kind: "money",
      group: "medicare",
    },
    {
      path: "medicare.countableResources",
      label: "Savings that count",
      kind: "money",
      group: "medicare",
    },
    tri("medicare.countableBasisConfirmed", "Someone has confirmed what counts", "medicare"),
    tri("medicare.receivesOtherMedicaid", "You get another kind of Medicaid", "medicare"),
    tri("medicare.receivesMsp", "You already get help paying Medicare premiums", "medicare"),
    tri("medicare.receivesFullMedicaid", "You get full Medicaid", "medicare"),
    {
      path: "medicare.extraHelpAnnualIncome",
      label: "Yearly income for drug-cost help",
      kind: "money",
      group: "medicare",
    },
    {
      path: "medicare.extraHelpResources",
      label: "Savings for drug-cost help",
      kind: "money",
      group: "medicare",
    },
    tri("medicare.extraHelpBasisConfirmed", "Someone has confirmed those figures", "medicare"),
    tri("medicare.specialPathwayReviewNeeded", "Your situation needs a closer look", "medicare"),
  ],
  wic: [
    {
      path: "wic.applicableHouseholdSize",
      label: "People counted for WIC",
      kind: "household",
      group: "wic",
    },
    { path: "wic.expectedInfants", label: "Babies expected", kind: "count", group: "wic", max: 10 },
    tri("wic.householdBasisConfirmed", "You have checked who counts for WIC", "wic"),
  ],
  lifeline: [
    {
      path: "lifeline.economicHouseholdSize",
      label: "People who share money and bills with you",
      kind: "household",
      group: "lifeline",
    },
    tri(
      "lifeline.householdBasisConfirmed",
      "You have checked who shares money with you",
      "lifeline",
    ),
    tri("lifeline.specialPathwayReviewNeeded", "Your situation needs a closer look", "lifeline"),
  ],
};

/** Common fields first, then only the groups this run actually asked about. */
export function fieldsForGroups(groups: readonly ExtractionGroup[]): FieldDescriptor[] {
  const seen = new Set(groups);
  const grouped = (Object.keys(GROUP_FIELDS) as ExtractionGroup[])
    .filter((group) => seen.has(group))
    .flatMap((group) => GROUP_FIELDS[group]);
  return [...COMMON_FIELDS, ...grouped];
}

export function descriptorFor(path: string): FieldDescriptor | undefined {
  return (
    COMMON_FIELDS.find((field) => field.path === path) ??
    (Object.keys(GROUP_FIELDS) as ExtractionGroup[])
      .flatMap((group) => GROUP_FIELDS[group])
      .find((field) => field.path === path)
  );
}
