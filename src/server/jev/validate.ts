/**
 * Strict validation of a Jev response against the exact question map that was
 * sent. The response is untrusted transport data: it must name the pinned
 * model, answer every question that was asked, answer nothing that was not
 * asked, and stay inside the bounds each question's type allows.
 *
 * A malformed response is never silently downgraded to a low-confidence answer,
 * and a missing answer is never read as zero risk. Both are failures.
 */

import type { Question } from "./client";
import { PINNED_JEV_MODEL } from "./config";

export type NoulAnswer = { readonly type: "noul"; readonly noul: number };

export type ScoreAnswer = {
  readonly type: "score";
  readonly score: number;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<string, number>>;
};

export type ChoiceAnswer = {
  readonly type: "choice";
  readonly choice: string;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<string, number>>;
};

export type Answer = NoulAnswer | ScoreAnswer | ChoiceAnswer;

export type ValidationFailure = {
  readonly ok: false;
  /** A closed reason code; never a provider message. */
  readonly reason:
    | "malformed_envelope"
    | "model_mismatch"
    | "missing_answer"
    | "unexpected_answer"
    | "malformed_answer";
  /** The question ID at fault, when the failure is specific to one. */
  readonly questionId?: string;
};

export type ValidationSuccess = {
  readonly ok: true;
  readonly answers: Readonly<Record<string, Answer>>;
};

export type ValidationResult = ValidationSuccess | ValidationFailure;

const PROBABILITY_SUM_TOLERANCE = 0.01;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnitNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Probabilities must cover exactly the expected keys, be in [0,1], and sum to 1. */
function probabilitiesValid(value: unknown, expectedKeys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== expectedKeys.length) return false;
  let sum = 0;
  for (const key of expectedKeys) {
    const p = value[key];
    if (!isUnitNumber(p)) return false;
    sum += p;
  }
  return Math.abs(sum - 1) <= PROBABILITY_SUM_TOLERANCE;
}

/** Legend, when present, must restate the authored criteria by index. */
function legendValid(value: unknown, criteria: readonly string[]): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== criteria.length) return false;
  return criteria.every((text, index) => value[String(index)] === text);
}

function validateAnswer(question: Question, raw: unknown): Answer | null {
  if (!isRecord(raw)) return null;

  if (question.type === "noul") {
    if (raw["type"] !== "noul") return null;
    // Noul carries no confidence field; `.noul` alone is the yes/no evidence.
    if (!isUnitNumber(raw["noul"])) return null;
    return { type: "noul", noul: raw["noul"] };
  }

  if (question.type === "score") {
    if (raw["type"] !== "score") return null;
    const criteria = question.criteria;
    const score = raw["score"];
    if (typeof score !== "number" || !Number.isFinite(score)) return null;
    if (score < 0 || score > criteria.length - 1) return null;
    const confidence = raw["confidence"];
    if (!isUnitNumber(confidence)) return null;
    if (!legendValid(raw["legend"], criteria)) return null;
    const indices = criteria.map((_, index) => String(index));
    if (!probabilitiesValid(raw["probabilities"], indices)) return null;
    return {
      type: "score",
      score,
      confidence,
      probabilities: raw["probabilities"] as Record<string, number>,
    };
  }

  if (raw["type"] !== "choice") return null;
  const keys = Object.keys(question.criteria);
  const choice = raw["choice"];
  if (typeof choice !== "string" || !keys.includes(choice)) return null;
  const confidence = raw["confidence"];
  if (!isUnitNumber(confidence)) return null;
  if (!probabilitiesValid(raw["probabilities"], keys)) return null;
  return {
    type: "choice",
    choice,
    confidence,
    probabilities: raw["probabilities"] as Record<string, number>,
  };
}

/**
 * Validates a raw response against the questions that were asked. Returns a
 * reason rather than throwing, so a caller can fall back to rules mode with an
 * honest badge instead of presenting a half-validated answer.
 */
export function validateEvaluationResponse(
  raw: unknown,
  questions: Readonly<Record<string, Question>>,
): ValidationResult {
  if (!isRecord(raw)) return { ok: false, reason: "malformed_envelope" };
  if (raw["model"] !== PINNED_JEV_MODEL) return { ok: false, reason: "model_mismatch" };
  const answers = raw["answers"];
  if (!isRecord(answers)) return { ok: false, reason: "malformed_envelope" };

  for (const id of Object.keys(answers)) {
    if (!(id in questions)) return { ok: false, reason: "unexpected_answer", questionId: id };
  }

  const validated: Record<string, Answer> = {};
  for (const id of Object.keys(questions)) {
    const rawAnswer = answers[id];
    if (rawAnswer === undefined) return { ok: false, reason: "missing_answer", questionId: id };
    const answer = validateAnswer(questions[id]!, rawAnswer);
    if (answer === null) return { ok: false, reason: "malformed_answer", questionId: id };
    validated[id] = answer;
  }

  return { ok: true, answers: validated };
}
