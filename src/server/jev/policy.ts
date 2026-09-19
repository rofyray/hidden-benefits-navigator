/**
 * Server-only question construction for the single evaluation batch.
 *
 * Every instruction is complete on its own: separate questions never see one
 * another's answers, so nothing here relies on context from a sibling. The only
 * interpolated values are server-authored IDs — program IDs from the fixed
 * catalog enum and criterion IDs from the screening result. No transcript, no
 * free text a person typed or spoke, and no whole handbook ever enters state.
 */

import type { Question } from "./client";

/** Bumped whenever an instruction or criterion wording changes. */
export const QUESTION_VERSION = "1.0.0";

/** Bumped whenever a threshold or gate in the display policy changes. */
export const POLICY_VERSION = "1.0.0";

/** Hard bounds so one batch can never grow without limit. */
export const MAX_CHECKS_PER_PROGRAM = 8;
export const MAX_PROGRAMS_PER_BATCH = 6;

export type NeedKind = "food" | "tax" | "utilities" | "medicare" | "phone" | "unspecified";

export type StateCheck = {
  /** Criterion ID authored in the catalog, never model- or user-supplied. */
  readonly id: string;
  /** Deterministic screening status computed in code. */
  readonly status: "pass" | "fail" | "unknown" | "notApplicable";
  /** One localized rule sentence from the catalog. */
  readonly rule: string;
};

export type ProgramState = {
  /** One sentence per screening condition, from the catalog. */
  readonly rules: readonly string[];
  readonly checks: readonly StateCheck[];
  /** The catalog's description of what this program helps with. */
  readonly helpDescription: string;
  /** A confirmed bounded enum extracted locally, never a free-text narrative. */
  readonly need: NeedKind;
};

export type EvaluationState = {
  readonly programs: Record<string, ProgramState>;
};

/** 0–2 rubric. Index 2 is the only positive end; index 0 is a clear non-match. */
export const MATCH_CRITERIA = [
  "The provided checks indicate a relevant unmet requirement.",
  "The checks leave a material uncertainty or incomplete pathway.",
  "The provided screening checks support a preliminary match.",
] as const;

export const RELEVANCE_CRITERIA = [
  "No stated connection",
  "Potentially useful",
  "Directly addresses the stated need",
] as const;

export function matchQuestionId(programId: string): string {
  return `${programId}_match`;
}

export function relevanceQuestionId(programId: string): string {
  return `${programId}_relevance`;
}

export function supportQuestionId(programId: string, checkId: string): string {
  return `${programId}_${checkId}_supported`;
}

/**
 * Trims each program's checks to the bounded set the batch will carry, so the
 * question map and the state describe exactly the same checks.
 */
export function boundProgramState(program: ProgramState): ProgramState {
  return { ...program, checks: program.checks.slice(0, MAX_CHECKS_PER_PROGRAM) };
}

export function evaluationState(programs: Record<string, ProgramState>): EvaluationState {
  const bounded: Record<string, ProgramState> = {};
  for (const id of Object.keys(programs).slice(0, MAX_PROGRAMS_PER_BATCH)) {
    bounded[id] = boundProgramState(programs[id]!);
  }
  return { programs: bounded };
}

/**
 * Builds the whole batch: one match score and one relevance score per program,
 * plus one bounded support Noul per check. Call it with the state returned by
 * `evaluationState` so the IDs line up.
 */
export function evaluationQuestions(state: EvaluationState): Record<string, Question> {
  const questions: Record<string, Question> = {};

  for (const id of Object.keys(state.programs)) {
    const program = state.programs[id]!;
    // `id` comes from the server's fixed program-ID enum, never from user text.
    const path = `programs.${id}`;

    questions[matchQuestionId(id)] = {
      type: "score",
      instructions:
        `How strongly do the supplied screening checks in ${path}.checks ` +
        `support a preliminary match to ${path}.rules? Use the supplied statuses; ` +
        `do not calculate numbers or infer missing facts.`,
      criteria: [...MATCH_CRITERIA],
    };

    questions[relevanceQuestionId(id)] = {
      type: "score",
      instructions: `How directly does ${path}.helpDescription address ${path}.need?`,
      criteria: [...RELEVANCE_CRITERIA],
    };

    for (const check of program.checks) {
      questions[supportQuestionId(id, check.id)] = {
        type: "noul",
        instructions:
          `Does the check with ID ${check.id} in ${path}.checks explicitly ` +
          `support its corresponding screening condition in ${path}.rules? ` +
          `Treat missing evidence as uncertain; do not invent it.`,
        criteria: { true: "Explicit support", false: "Explicit contradiction" },
      };
    }
  }

  return questions;
}
