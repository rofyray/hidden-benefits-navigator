import { describe, expect, it, vi } from "vitest";
import { PINNED_JEV_MODEL, systemOne } from "@/server/jev/client";
import {
  MATCH_CRITERIA,
  MAX_CHECKS_PER_PROGRAM,
  POLICY_VERSION,
  QUESTION_VERSION,
  RELEVANCE_CRITERIA,
  evaluationQuestions,
  evaluationState,
  matchQuestionId,
  relevanceQuestionId,
  supportQuestionId,
  type ProgramState,
} from "@/server/jev/policy";
import { validateEvaluationResponse } from "@/server/jev/validate";
import {
  CONFIDENT_NEGATIVE,
  CONFIDENT_POSITIVE,
  SYNTHETIC_PROGRAMS,
  noulAnswer,
  scoreAnswer,
} from "../fixtures/jev-responses";

const state = evaluationState(SYNTHETIC_PROGRAMS);
const questions = evaluationQuestions(state);

/** Builds a complete, well-formed answer set for a question map. */
function answersFor(
  map: typeof questions,
  score: Record<string, unknown> = CONFIDENT_POSITIVE,
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const [id, question] of Object.entries(map)) {
    answers[id] = question.type === "noul" ? noulAnswer(0.9) : score;
  }
  return answers;
}

describe("evaluation question builder", () => {
  it("is versioned", () => {
    expect(QUESTION_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(POLICY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("covers all six programs with match, relevance and per-check support questions", () => {
    const programIds = Object.keys(SYNTHETIC_PROGRAMS);
    expect(programIds).toHaveLength(6);
    const expected = programIds.flatMap((id) => [
      matchQuestionId(id),
      relevanceQuestionId(id),
      ...SYNTHETIC_PROGRAMS[id]!.checks.map((c) => supportQuestionId(id, c.id)),
    ]);
    expect(Object.keys(questions).sort()).toEqual(expected.sort());
  });

  it("uses the authored 0-2 rubrics", () => {
    const match = questions[matchQuestionId("snap")]!;
    const relevance = questions[relevanceQuestionId("snap")]!;
    expect(match.type === "score" && match.criteria).toEqual([...MATCH_CRITERIA]);
    expect(relevance.type === "score" && relevance.criteria).toEqual([...RELEVANCE_CRITERIA]);
  });

  it("writes complete instructions that reference server-authored paths only", () => {
    for (const question of Object.values(questions)) {
      expect(question.instructions.length).toBeGreaterThan(40);
      expect(question.instructions).toMatch(/programs\.[a-z_]+\./);
    }
  });

  it("bounds the checks carried per program", () => {
    const many: ProgramState = {
      ...SYNTHETIC_PROGRAMS["snap"]!,
      checks: Array.from({ length: 20 }, (_, i) => ({
        id: `c${i}`,
        status: "unknown" as const,
        rule: "A condition.",
      })),
    };
    const bounded = evaluationState({ snap: many });
    expect(bounded.programs["snap"]!.checks).toHaveLength(MAX_CHECKS_PER_PROGRAM);
    // The question map describes exactly the checks the state carries.
    const built = evaluationQuestions(bounded);
    expect(Object.keys(built)).toHaveLength(MAX_CHECKS_PER_PROGRAM + 2);
  });

  it("carries no transcript: state holds only catalog text, statuses and a need enum", () => {
    const serialized = JSON.stringify(state);
    expect(serialized).not.toMatch(/transcript|said|I need help/i);
    for (const program of Object.values(state.programs)) {
      expect(["food", "tax", "utilities", "medicare", "phone", "unspecified"]).toContain(
        program.need,
      );
      for (const check of program.checks) {
        expect(["pass", "fail", "unknown", "notApplicable"]).toContain(check.status);
      }
    }
  });

  it("produces a stable snapshot for the synthetic state", () => {
    expect(questions[matchQuestionId("wic")]).toMatchInlineSnapshot(`
      {
        "criteria": [
          "The provided checks indicate a relevant unmet requirement.",
          "The checks leave a material uncertainty or incomplete pathway.",
          "The provided screening checks support a preliminary match.",
        ],
        "instructions": "How strongly do the supplied screening checks in programs.wic.checks support a preliminary match to programs.wic.rules? Use the supplied statuses; do not calculate numbers or infer missing facts.",
        "type": "score",
      }
    `);
  });
});

describe("response validation", () => {
  const ok = { model: PINNED_JEV_MODEL, answers: answersFor(questions) };

  it("accepts a complete well-formed response", () => {
    const result = validateEvaluationResponse(ok, questions);
    expect(result.ok).toBe(true);
  });

  it("accepts an optional legend that restates the criteria", () => {
    const map = { m: questions[matchQuestionId("snap")]! };
    const legend = Object.fromEntries(MATCH_CRITERIA.map((text, i) => [String(i), text]));
    const result = validateEvaluationResponse(
      { model: PINNED_JEV_MODEL, answers: { m: { ...CONFIDENT_POSITIVE, legend } } },
      map,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a legend that does not match the authored criteria", () => {
    const map = { m: questions[matchQuestionId("snap")]! };
    const result = validateEvaluationResponse(
      {
        model: PINNED_JEV_MODEL,
        answers: { m: { ...CONFIDENT_POSITIVE, legend: { "0": "a", "1": "b", "2": "c" } } },
      },
      map,
    );
    expect(result).toMatchObject({ ok: false, reason: "malformed_answer" });
  });

  it("rejects a different model", () => {
    const result = validateEvaluationResponse({ ...ok, model: "jev-9.9.9" }, questions);
    expect(result).toMatchObject({ ok: false, reason: "model_mismatch" });
  });

  it("rejects a missing answer rather than treating it as neutral", () => {
    const answers = { ...ok.answers };
    delete answers[matchQuestionId("snap")];
    const result = validateEvaluationResponse({ ...ok, answers }, questions);
    expect(result).toMatchObject({
      ok: false,
      reason: "missing_answer",
      questionId: matchQuestionId("snap"),
    });
  });

  it("rejects an answer to a question that was never asked", () => {
    const result = validateEvaluationResponse(
      { ...ok, answers: { ...ok.answers, invented: noulAnswer(0.5) } },
      questions,
    );
    expect(result).toMatchObject({ ok: false, reason: "unexpected_answer" });
  });

  it("rejects a malformed envelope", () => {
    expect(validateEvaluationResponse(null, questions)).toMatchObject({
      reason: "malformed_envelope",
    });
    expect(validateEvaluationResponse("nope", questions)).toMatchObject({
      reason: "malformed_envelope",
    });
    expect(validateEvaluationResponse({ model: PINNED_JEV_MODEL }, questions)).toMatchObject({
      reason: "malformed_envelope",
    });
  });

  it("rejects a score outside the rubric", () => {
    const map = { m: questions[matchQuestionId("snap")]! };
    for (const score of [-0.1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const answer = { ...CONFIDENT_POSITIVE, score };
      expect(
        validateEvaluationResponse({ model: PINNED_JEV_MODEL, answers: { m: answer } }, map),
      ).toMatchObject({ reason: "malformed_answer" });
    }
  });

  it("rejects an out-of-range or missing confidence", () => {
    const map = { m: questions[matchQuestionId("snap")]! };
    for (const confidence of [-0.01, 1.01, "high", undefined]) {
      const answer = { ...CONFIDENT_POSITIVE, confidence };
      expect(
        validateEvaluationResponse({ model: PINNED_JEV_MODEL, answers: { m: answer } }, map),
      ).toMatchObject({ reason: "malformed_answer" });
    }
  });

  it("rejects probabilities that are out of range, mis-keyed or do not sum to one", () => {
    const map = { m: questions[matchQuestionId("snap")]! };
    const bad = [
      { "0": 0.1, "1": 0.1, "2": 0.1 },
      { "0": -0.1, "1": 0.5, "2": 0.6 },
      { "0": 0.5, "2": 0.5 },
      { a: 0.3, b: 0.3, c: 0.4 },
    ];
    for (const probabilities of bad) {
      const answer = { ...CONFIDENT_POSITIVE, probabilities };
      expect(
        validateEvaluationResponse({ model: PINNED_JEV_MODEL, answers: { m: answer } }, map),
      ).toMatchObject({ reason: "malformed_answer" });
    }
  });

  it("rejects a Noul outside [0,1] and a Noul answered as a score", () => {
    const map = { s: questions[supportQuestionId("snap", "income")]! };
    for (const answer of [noulAnswer(1.4), noulAnswer(Number.NaN), CONFIDENT_POSITIVE]) {
      expect(
        validateEvaluationResponse({ model: PINNED_JEV_MODEL, answers: { s: answer } }, map),
      ).toMatchObject({ reason: "malformed_answer" });
    }
  });

  it("accepts a choice inside its authored criteria and rejects one outside", () => {
    const map = {
      c: {
        type: "choice" as const,
        instructions: "Which need?",
        criteria: { food: "food help", other: "anything else" },
      },
    };
    const good = {
      type: "choice",
      choice: "food",
      confidence: 1,
      probabilities: { food: 1, other: 0 },
    };
    expect(
      validateEvaluationResponse({ model: PINNED_JEV_MODEL, answers: { c: good } }, map).ok,
    ).toBe(true);
    const bad = { ...good, choice: "invented" };
    expect(
      validateEvaluationResponse({ model: PINNED_JEV_MODEL, answers: { c: bad } }, map),
    ).toMatchObject({ reason: "malformed_answer" });
  });

  it("keeps a confident negative distinguishable from a positive match", () => {
    const map = { m: questions[matchQuestionId("eitc")]! };
    const result = validateEvaluationResponse(
      { model: PINNED_JEV_MODEL, answers: { m: CONFIDENT_NEGATIVE } },
      map,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const answer = result.answers["m"]!;
    expect(answer.type).toBe("score");
    if (answer.type !== "score") return;
    // High confidence in a score near zero: a confident non-match, not a match.
    expect(answer.confidence).toBeGreaterThan(0.9);
    expect(answer.score).toBeLessThan(0.5);
  });

  it("does not turn a malformed answer into a low-confidence one", () => {
    const map = { m: questions[matchQuestionId("snap")]! };
    const result = validateEvaluationResponse(
      { model: PINNED_JEV_MODEL, answers: { m: { type: "score", score: 1 } } },
      map,
    );
    expect(result).toMatchObject({ ok: false, reason: "malformed_answer" });
  });
});

describe("six-program batch integration (mocked)", () => {
  it("evaluates all six programs in exactly one provider call", async () => {
    process.env["TYPESAFE_API_KEY"] = "test-key";
    process.env["JEV_MODEL"] = PINNED_JEV_MODEL;

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        questions: Record<string, { type: string; criteria?: unknown }>;
      };
      const answers: Record<string, unknown> = {};
      for (const [id, question] of Object.entries(body.questions)) {
        answers[id] =
          question.type === "noul"
            ? noulAnswer(0.88)
            : scoreAnswer(1.8, 0.9, { "0": 0.02, "1": 0.08, "2": 0.9 });
      }
      return new Response(JSON.stringify({ model: body.model, answers }), { status: 200 });
    }) as unknown as typeof fetch;

    const raw = await systemOne(state, questions, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const result = validateEvaluationResponse(raw, questions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of Object.keys(SYNTHETIC_PROGRAMS)) {
      expect(result.answers[matchQuestionId(id)]).toBeDefined();
      expect(result.answers[relevanceQuestionId(id)]).toBeDefined();
    }
  });
});
