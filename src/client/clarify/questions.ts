/**
 * Authored follow-up questions.
 *
 * Every question here is written by hand and shipped with the app. The
 * on-device model never invents a question: code decides *which* field is
 * missing, and this bank decides *how* it is asked. That keeps the wording
 * reviewable and keeps a model from asking for something the programmes do not
 * need.
 *
 * Each question points at one contract field path, so an answer can only ever
 * land in a field the contracts already accept. Order in `QUESTION_BANK` is the
 * asking order: the facts that change the most programme outcomes come first.
 */

import { descriptorFor, type FieldKind, type FieldOption } from "@/client/review/fields";

export const CLARIFY_QUESTION_VERSION = "1.0.0" as const;

/**
 * How many optional follow-up turns a person is offered before results are
 * shown as they stand. Mirrors the display policy the server applies; kept as a
 * local constant so no browser module imports server code.
 */
export const MAX_CLARIFY_TURNS = 3;

/** Candidates considered for a single turn; only one is shown at a time. */
export const MAX_CANDIDATES_PER_TURN = 3;

export type ClarifyQuestion = {
  /** Stable question id. Equals `path` unless a field carries two questions. */
  id: string;
  /** Contract field path this answer writes to. */
  path: string;
  /** Plain-language question text, authored, never generated. */
  text: string;
  /** Short note shown under the question when it helps. */
  help?: string;
  kind: FieldKind;
  /** Buttons offered for this question; falls back to the field descriptor. */
  options?: readonly FieldOption[];
  /**
   * Builds the value written to `path` from the answer. Present only where the
   * answer is one part of a larger field (an income basis inside `income`).
   */
  writes?: (current: unknown, answer: unknown) => unknown;
  /** Overrides the default "is this field still missing?" test. */
  needed?: (current: unknown) => boolean;
  /** The value that records an explicit "not sure" for this question. */
  unknownValue?: (current: unknown) => unknown;
};

const YES_NO_NOT_SURE: readonly FieldOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Not sure" },
];

function ask(path: string, text: string, help?: string): ClarifyQuestion {
  const descriptor = descriptorFor(path);
  return {
    id: path,
    path,
    text,
    kind: descriptor?.kind ?? "tri",
    ...(descriptor?.options ? { options: descriptor.options } : {}),
    ...(help ? { help } : {}),
  };
}

function askYesNo(path: string, text: string, help?: string): ClarifyQuestion {
  return { ...ask(path, text, help), kind: "tri", options: YES_NO_NOT_SURE };
}

/** Asking order: the fields that change the most programme outcomes first. */
export const QUESTION_BANK: readonly ClarifyQuestion[] = [
  ask("state", "Which state do you live in?"),
  ask("householdSize", "How many people live with you, counting yourself?"),
  ask(
    "income",
    "Roughly how much money comes in?",
    "A range is fine. Leave it empty if you would rather not say.",
  ),
  {
    id: "income.basis",
    path: "income",
    text: "Is that amount before taxes are taken out?",
    kind: "enum",
    options: [
      { value: "gross", label: "Before taxes" },
      { value: "net", label: "After taxes" },
      { value: "unknown", label: "Not sure" },
    ],
    writes: (current, answer) =>
      typeof current === "object" && current !== null
        ? { ...(current as Record<string, unknown>), basis: answer }
        : current,
    needed: (current) =>
      typeof current === "object" &&
      current !== null &&
      (current as { basis?: string }).basis === "unknown",
    unknownValue: (current) => current,
  },
  ask("foodHouseholdSize", "How many people buy and prepare food together in your home?"),
  ask("ageBand", "Which age group are you in?"),
  askYesNo("medicarePartA", "Do you currently have Medicare Part A?"),
  ask("employment", "What best describes your work situation?"),
  askYesNo("pregnant", "Are you pregnant right now?"),
  askYesNo("childUnder5", "Does a child under 5 live with you?"),
  askYesNo("receivesSnap", "Do you already get SNAP food benefits?"),
  askYesNo("receivesMedicaid", "Do you already get Medicaid?"),
  askYesNo("receivesSsi", "Do you already get SSI?"),
  askYesNo(
    "existingLifeline",
    "Does anyone in your home already get a phone or internet discount?",
  ),
  askYesNo("sharesFood", "Do you share food costs with other people in your home?"),
  ask("eitc.taxYear", "Which tax year would you like to check?"),
  ask("eitc.filingStatus", "How do you file your taxes?"),
  ask("eitc.qualifyingChildrenCount", "How many children could count on your tax return?"),
  askYesNo(
    "snap.olderOrDisabled",
    "Is anyone in your home 60 or older, or living with a disability?",
  ),
  ask("ceap.utilityResponsibility", "Whose name is the electricity or gas bill in?"),
  askYesNo("ceap.needsHeatingCoolingHelp", "Do you need help with heating or cooling costs?"),
  ask("medicare.category", "Are you asking about yourself alone, or about you and a spouse?"),
  ask("wic.applicableHouseholdSize", "How many people should be counted for WIC?"),
  ask("lifeline.economicHouseholdSize", "How many people share money and bills with you?"),
];

export function questionById(id: string): ClarifyQuestion | undefined {
  return QUESTION_BANK.find((question) => question.id === id);
}
