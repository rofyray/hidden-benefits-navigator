/**
 * Synthetic Jev responses. The shapes match one live probe made on
 * 2026-09-19 against `jev-1.13.0` (recorded in docs/evidence/P1-12.md);
 * the values here are authored, not observed judgments.
 */

import type { ProgramState } from "@/server/jev/policy";

export const SYNTHETIC_PROGRAMS: Record<string, ProgramState> = {
  snap: {
    rules: ["Household gross monthly income is at or below the published limit."],
    helpDescription: "Monthly money on a card for groceries.",
    need: "food",
    checks: [
      { id: "income", status: "pass", rule: "Gross monthly income is at or below the limit." },
      { id: "state", status: "pass", rule: "The household lives in Texas." },
    ],
  },
  wic: {
    rules: ["An applicant is pregnant, postpartum, breastfeeding, or a child under five."],
    helpDescription: "Food, formula and nutrition support for young families.",
    need: "food",
    checks: [{ id: "category", status: "unknown", rule: "Someone meets a WIC category." }],
  },
  eitc: {
    rules: ["Adjusted gross income is below the published table amount."],
    helpDescription: "A refund on a federal tax return.",
    need: "tax",
    checks: [{ id: "agi", status: "fail", rule: "Income is above the table amount." }],
  },
  ceap: {
    rules: ["Local agencies decide energy assistance."],
    helpDescription: "Help paying an electricity or gas bill.",
    need: "utilities",
    checks: [{ id: "referral", status: "notApplicable", rule: "Routed to 2-1-1 Texas." }],
  },
  medicare_help: {
    rules: ["Monthly income is at or below the Medicare Savings Program limit."],
    helpDescription: "Help paying Medicare premiums and drug costs.",
    need: "medicare",
    checks: [{ id: "enrolled", status: "unknown", rule: "The person has Medicare Part A." }],
  },
  lifeline: {
    rules: ["The household receives a qualifying program or is under the income table."],
    helpDescription: "A monthly discount on phone or internet service.",
    need: "phone",
    checks: [{ id: "participation", status: "pass", rule: "The household receives SNAP." }],
  },
};

export const scoreAnswer = (
  score: number,
  confidence: number,
  probabilities: Record<string, number>,
) => ({ type: "score", score, confidence, probabilities });

export const noulAnswer = (noul: number) => ({ type: "noul", noul });

/** A confident answer at the negative end of the 0–2 rubric. */
export const CONFIDENT_NEGATIVE = scoreAnswer(0.05, 0.97, { "0": 0.96, "1": 0.03, "2": 0.01 });

/** A confident answer at the positive end. */
export const CONFIDENT_POSITIVE = scoreAnswer(1.95, 0.93, { "0": 0.01, "1": 0.03, "2": 0.96 });

/** A positive-leaning score the model is not sure about. */
export const UNSURE_POSITIVE = scoreAnswer(1.6, 0.41, { "0": 0.2, "1": 0.3, "2": 0.5 });
