/**
 * Follow-up clarification: selection, answers, skipping and the turn cap.
 *
 * Each test is named for the behaviour it protects, not the function it calls.
 */

import { describe, expect, it } from "vitest";
import {
  CLARIFY_QUESTION_VERSION,
  MAX_CLARIFY_TURNS,
  QUESTION_BANK,
  answerCurrent,
  initialClarifySession,
  isMissingValue,
  nextQuestion,
  openNextQuestion,
  questionById,
  selectClarifications,
  stopClarifying,
  type ClarifySession,
} from "@/client/clarify";
import { descriptorFor } from "@/client/review/fields";
import {
  getFieldValue,
  initialReviewState,
  reviewReducer,
  type ReviewState,
} from "@/client/review/state";

function baseState(overrides: Partial<ReviewState> = {}): ReviewState {
  return { ...initialReviewState(), ...overrides };
}

function set(state: ReviewState, path: string, value: unknown): ReviewState {
  return reviewReducer(state, { type: "setField", path, value });
}

function opened(state: ReviewState): { review: ReviewState; session: ClarifySession } {
  return { review: state, session: openNextQuestion(state, initialClarifySession()) };
}

describe("question bank", () => {
  it("is versioned so a wording change is traceable", () => {
    expect(CLARIFY_QUESTION_VERSION).toBe("1.0.0");
  });

  it("only ever writes to fields the review form already knows", () => {
    for (const question of QUESTION_BANK) {
      expect(descriptorFor(question.path), question.id).toBeDefined();
    }
  });

  it("gives every question a unique id", () => {
    const ids = QUESTION_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("asks every question as a plain question", () => {
    for (const question of QUESTION_BANK) {
      expect(question.text.endsWith("?"), question.id).toBe(true);
    }
  });
});

describe("selection", () => {
  it("treats explicit unknowns and nulls as missing, not real answers", () => {
    expect(isMissingValue(null)).toBe(true);
    expect(isMissingValue("unknown")).toBe(true);
    expect(isMissingValue("yes")).toBe(false);
    expect(isMissingValue(3)).toBe(false);
  });

  it("asks the highest-priority missing fact first", () => {
    const candidates = selectClarifications(baseState());
    expect(candidates[0]?.id).toBe("state");
  });

  it("never asks again about a fact the person has given", () => {
    const state = set(baseState(), "state", "TX");
    const ids = selectClarifications(state, { limit: 20 }).map((q) => q.id);
    expect(ids).not.toContain("state");
  });

  it("asks about a fact the model was unsure of even though it has a value", () => {
    const state = baseState({ ambiguous: { householdSize: true } });
    const withValue = set(state, "householdSize", 3);
    const ambiguousAgain = { ...withValue, ambiguous: { householdSize: true as const } };
    const ids = selectClarifications(ambiguousAgain, { limit: 20 }).map((q) => q.id);
    expect(ids).toContain("householdSize");
  });

  it("does not ask programme questions for groups this run does not need", () => {
    const state = baseState({ groupsAsked: ["snap"] });
    const ids = selectClarifications(state, { limit: 30 }).map((q) => q.id);
    expect(ids).toContain("snap.olderOrDisabled");
    expect(ids).not.toContain("eitc.taxYear");
  });

  it("offers at most three candidates for one turn", () => {
    expect(selectClarifications(baseState()).length).toBeLessThanOrEqual(3);
  });

  it("asks about the income basis only once an amount is known", () => {
    const withoutIncome = selectClarifications(baseState(), { limit: 30 }).map((q) => q.id);
    expect(withoutIncome).not.toContain("income.basis");

    const withIncome = set(baseState(), "income", {
      interval: { minCents: 100_000, maxCents: 150_000 },
      period: "monthly",
      basis: "unknown",
    });
    const ids = selectClarifications(withIncome, { limit: 30 }).map((q) => q.id);
    expect(ids).toContain("income.basis");
  });

  it("excludes anything already resolved or skipped", () => {
    const ids = selectClarifications(baseState(), {
      resolved: ["state"],
      skipped: ["householdSize"],
      limit: 30,
    }).map((q) => q.id);
    expect(ids).not.toContain("state");
    expect(ids).not.toContain("householdSize");
  });
});

describe("one question at a time", () => {
  it("shows a single question and records the answer in the facts", () => {
    const start = opened(baseState());
    expect(start.session.currentId).toBe("state");

    const step = answerCurrent(start.review, start.session, { type: "value", value: "TX" });
    expect(step.review.facts.state).toBe("TX");
    expect(step.review.origins["state"]).toBe("manual");
    expect(step.session.turn).toBe(1);
    expect(step.session.currentId).not.toBe("state");
  });

  it("writes an income basis into the existing amount instead of replacing it", () => {
    const withIncome = set(baseState(), "income", {
      interval: { minCents: 100_000, maxCents: null },
      period: "monthly",
      basis: "unknown",
    });
    let session = initialClarifySession();
    session = { ...session, currentId: "income.basis" };
    const step = answerCurrent(withIncome, session, { type: "value", value: "gross" });
    expect(step.review.facts.income).toEqual({
      interval: { minCents: 100_000, maxCents: null },
      period: "monthly",
      basis: "gross",
    });
  });

  it("reveals the options without spending a turn", () => {
    const start = opened(baseState());
    const step = answerCurrent(start.review, start.session, { type: "showOptions" });
    expect(step.session.showOptions).toBe(true);
    expect(step.session.turn).toBe(0);
    expect(step.session.currentId).toBe(start.session.currentId);
  });
});

describe("unknown and skip", () => {
  it("records 'not sure' as an explicit unknown, never as a no", () => {
    const state = baseState({ groupsAsked: ["snap"] });
    let session: ClarifySession = {
      ...initialClarifySession(),
      currentId: "snap.olderOrDisabled",
    };
    const step = answerCurrent(state, session, { type: "unknown" });
    expect(step.review.extensions.snap.olderOrDisabled).toBe("unknown");
    expect(step.session.resolved).toContain("snap.olderOrDisabled");
    session = step.session;
    expect(session.currentId).not.toBe("snap.olderOrDisabled");
  });

  it("records 'not sure' for a nullable fact as nothing at all", () => {
    const session: ClarifySession = { ...initialClarifySession(), currentId: "householdSize" };
    const step = answerCurrent(baseState(), session, { type: "unknown" });
    expect(step.review.facts.householdSize).toBeNull();
  });

  it("skipping changes no fact and does not ask the same question again", () => {
    const start = opened(baseState());
    const skipped = answerCurrent(start.review, start.session, { type: "skip" });
    expect(skipped.review.facts.state).toBeNull();
    expect(skipped.review.revision).toBe(start.review.revision);
    expect(skipped.session.skipped).toContain("state");
    expect(skipped.session.currentId).not.toBe("state");
    expect(nextQuestion(skipped.review, skipped.session)?.id).not.toBe("state");
  });

  it("cannot loop: repeated skips always move on and end the session", () => {
    let review = baseState();
    let session = openNextQuestion(review, initialClarifySession());
    const seen: string[] = [];
    for (let i = 0; i < 10 && session.currentId; i += 1) {
      seen.push(session.currentId);
      const step = answerCurrent(review, session, { type: "skip" });
      review = step.review;
      session = step.session;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(session.done).toBe(true);
  });
});

describe("turn cap", () => {
  it("stops asking after three optional turns", () => {
    let review = baseState();
    let session = openNextQuestion(review, initialClarifySession());
    for (let i = 0; i < MAX_CLARIFY_TURNS; i += 1) {
      expect(session.currentId).not.toBeNull();
      const step = answerCurrent(review, session, { type: "unknown" });
      review = step.review;
      session = step.session;
    }
    expect(session.turn).toBe(MAX_CLARIFY_TURNS);
    expect(session.currentId).toBeNull();
    expect(session.done).toBe(true);
    expect(nextQuestion(review, session)).toBeNull();
  });

  it("ignores further answers once the session is done", () => {
    const review = baseState();
    const session = stopClarifying({ ...initialClarifySession(), currentId: "state" });
    const step = answerCurrent(review, session, { type: "value", value: "TX" });
    expect(step.review.facts.state).toBeNull();
  });

  it("closes the session when nothing is left worth asking", () => {
    let review = baseState({ groupsAsked: [] });
    for (const path of ["state", "householdSize", "foodHouseholdSize"]) {
      review = set(review, path, path === "state" ? "TX" : 2);
    }
    const session = openNextQuestion(review, {
      ...initialClarifySession(),
      resolved: QUESTION_BANK.map((q) => q.id),
    });
    expect(session.currentId).toBeNull();
    expect(session.done).toBe(true);
  });
});

describe("refused answers and re-evaluation", () => {
  it("keeps the previous fact and the same question when an answer is impossible", () => {
    const review = set(baseState(), "householdSize", 3);
    const session = { ...initialClarifySession(), currentId: "householdSize" };
    const step = answerCurrent(review, session, { type: "value", value: 0 });
    expect(step.review.facts.householdSize).toBe(3);
    expect(step.session.currentId).toBe("householdSize");
    expect(step.session.turn).toBe(0);
    expect(step.session.rejectedId).toBe("householdSize");
  });

  it("asks for screening again only when an answer changed a fact", () => {
    const start = opened(baseState());
    const skipped = answerCurrent(start.review, start.session, { type: "skip" });
    expect(skipped.session.needsReevaluation).toBe(false);

    const answered = answerCurrent(start.review, start.session, { type: "value", value: "TX" });
    expect(answered.session.needsReevaluation).toBe(true);

    const repeated = answerCurrent(
      answered.review,
      {
        ...initialClarifySession(),
        currentId: "state",
      },
      { type: "value", value: "TX" },
    );
    expect(repeated.session.needsReevaluation).toBe(false);
  });

  it("leaves facts the person already confirmed untouched", () => {
    let review = set(baseState(), "state", "TX");
    review = reviewReducer(review, { type: "confirm" });
    const session = { ...initialClarifySession(), currentId: "householdSize" };
    const step = answerCurrent(review, session, { type: "value", value: 4 });
    expect(getFieldValue(step.review, "state")).toBe("TX");
    expect(step.review.origins["state"]).toBe("manual");
    expect(step.review.facts.householdSize).toBe(4);
  });

  it("resolves a question by its id, including the second question on one field", () => {
    expect(questionById("income")?.path).toBe("income");
    expect(questionById("income.basis")?.path).toBe("income");
    expect(questionById("nope")).toBeUndefined();
  });
});
