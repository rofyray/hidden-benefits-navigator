/**
 * The follow-up turn loop.
 *
 * Rules this module exists to hold:
 *
 * - One question is shown at a time, and only for a field code found missing.
 * - Skipping records a skip, never a value. "Not sure" records an explicit
 *   unknown, never a "no".
 * - A question that has been answered, skipped or answered "not sure" is never
 *   asked again, so the loop cannot circle back on itself.
 * - After three optional turns the session ends and results are shown as they
 *   stand.
 * - An answer that the contracts refuse keeps the previous fact and does not
 *   spend a turn.
 * - Screening is re-run only when an answer actually changed a fact, so a skip
 *   or a repeated answer costs nothing.
 */

import { getFieldValue, reviewReducer, type ReviewState } from "@/client/review/state";
import { MAX_CLARIFY_TURNS, questionById, type ClarifyQuestion } from "./questions";
import { selectClarifications } from "./select";

export type ClarifySession = {
  /** Completed turns: answered, "not sure" or skipped. */
  turn: number;
  /** Question currently on screen. */
  currentId: string | null;
  /** Answered or explicitly answered "not sure"; never asked again. */
  resolved: string[];
  /** Skipped; never asked again and never turned into a value. */
  skipped: string[];
  /** Whether the option buttons are expanded for the current question. */
  showOptions: boolean;
  /** Set when the last answer was outside the contract and was refused. */
  rejectedId: string | null;
  /** True once an answer changed a fact, so screening should run again. */
  needsReevaluation: boolean;
  /** Closed by the turn cap or because nothing is left to ask. */
  done: boolean;
};

export type ClarifyAnswer =
  | { type: "value"; value: unknown }
  | { type: "unknown" }
  | { type: "skip" }
  | { type: "showOptions" };

export function initialClarifySession(): ClarifySession {
  return {
    turn: 0,
    currentId: null,
    resolved: [],
    skipped: [],
    showOptions: false,
    rejectedId: null,
    needsReevaluation: false,
    done: false,
  };
}

/** The next question to show, or `null` when the session is over. */
export function nextQuestion(review: ReviewState, session: ClarifySession): ClarifyQuestion | null {
  if (session.done || session.turn >= MAX_CLARIFY_TURNS) return null;
  const [first] = selectClarifications(review, {
    resolved: session.resolved,
    skipped: session.skipped,
    limit: 1,
  });
  return first ?? null;
}

/** Puts the next question on screen, or closes the session if none is left. */
export function openNextQuestion(review: ReviewState, session: ClarifySession): ClarifySession {
  const question = nextQuestion(review, session);
  if (!question) {
    return { ...session, currentId: null, showOptions: false, done: true };
  }
  return { ...session, currentId: question.id, showOptions: false, rejectedId: null };
}

export type ClarifyStep = { review: ReviewState; session: ClarifySession };

/** Applies one action to the question currently on screen. */
export function answerCurrent(
  review: ReviewState,
  session: ClarifySession,
  answer: ClarifyAnswer,
): ClarifyStep {
  if (session.currentId === null || session.done) return { review, session };
  const question = questionById(session.currentId);
  if (!question) return { review, session };

  if (answer.type === "showOptions") {
    return { review, session: { ...session, showOptions: true } };
  }

  if (answer.type === "skip") {
    return {
      review,
      session: closeTurn({ ...session, skipped: [...session.skipped, question.id] }, review),
    };
  }

  const current = getFieldValue(review, question.path);
  const value =
    answer.type === "unknown"
      ? question.unknownValue
        ? question.unknownValue(current)
        : unknownFor(question, current)
      : question.writes
        ? question.writes(current, answer.value)
        : answer.value;

  const nextReview = reviewReducer(review, { type: "setField", path: question.path, value });

  // A refused answer leaves the previous fact in place and does not spend a turn.
  if (nextReview.lastRejectedPath === question.path) {
    return { review: nextReview, session: { ...session, rejectedId: question.id } };
  }

  const changed = !sameValue(current, getFieldValue(nextReview, question.path));
  return {
    review: nextReview,
    session: closeTurn(
      {
        ...session,
        resolved: [...session.resolved, question.id],
        rejectedId: null,
        needsReevaluation: session.needsReevaluation || (answer.type === "value" && changed),
      },
      nextReview,
    ),
  };
}

/** Ends the follow-ups early; results are shown as they stand. */
export function stopClarifying(session: ClarifySession): ClarifySession {
  return { ...session, currentId: null, showOptions: false, done: true };
}

/** Acknowledges a re-run, so one change cannot trigger repeated screening. */
export function clearReevaluation(session: ClarifySession): ClarifySession {
  return { ...session, needsReevaluation: false };
}

function closeTurn(session: ClarifySession, review: ReviewState): ClarifySession {
  const spent = { ...session, turn: session.turn + 1, showOptions: false };
  return openNextQuestion(review, spent);
}

/** The explicit unknown for this field's shape — never a "no", never a zero. */
function unknownFor(question: ClarifyQuestion, _current: unknown): unknown {
  if (question.kind === "tri") return "unknown";
  const hasUnknownOption = question.options?.some((option) => option.value === "unknown");
  if (hasUnknownOption) return "unknown";
  return null;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
