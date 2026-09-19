import { describe, expect, it } from "vitest";
import type { CriterionResult } from "@/shared/contracts";
import type { ProgramScreening } from "@/shared/screening";
import {
  AGENCY_ONLY_FIELD_IDS,
  DISPLAY_POLICY,
  fieldBurden,
  labelFor,
  mostUncertainNoul,
  rankResults,
  selectFollowUps,
} from "@/server/jev/display";

function criterion(
  id: string,
  status: CriterionResult["status"],
  blocksLikely = false,
): CriterionResult {
  return { id, status, evidenceIds: [`ev.${id}`], reasonCode: `reason.${id}`, blocksLikely };
}

function screening(criteria: CriterionResult[], applicable = true): ProgramScreening {
  return {
    programId: "snap",
    applicable,
    criteria,
    missingFieldIds: criteria.filter((c) => c.status === "unknown").map((c) => c.id),
    evidenceIds: criteria.flatMap((c) => c.evidenceIds),
    reasonIds: criteria.map((c) => c.reasonCode),
  };
}

const clean = screening([criterion("income", "pass"), criterion("state", "pass")]);
const strongModel = { score: 1.9, confidence: 0.92 };

describe("label policy", () => {
  it("gives Likely only with clean rules, a strong score and high confidence", () => {
    const outcome = labelFor({
      screening: clean,
      covered: true,
      staleEvidence: false,
      model: strongModel,
    });
    expect(outcome.label).toBe("likely");
    expect(outcome.rulesOnly).toBe(false);
  });

  it("treats a definitive exclusion as a clear non-match with a reason", () => {
    const outcome = labelFor({
      screening: screening([criterion("income", "fail"), criterion("state", "pass")]),
      covered: true,
      staleEvidence: false,
      model: strongModel,
    });
    expect(outcome.label).toBe("notAClearMatch");
    expect(outcome.reasonIds).toContain("policy.rule_exclusion");
  });

  it("cannot reach Likely on model confidence when a material fact is missing", () => {
    const outcome = labelFor({
      screening: screening([criterion("income", "pass"), criterion("category", "unknown", true)]),
      covered: true,
      staleEvidence: false,
      model: { score: 2, confidence: 1 },
    });
    expect(outcome.label).toBe("possibly");
    expect(outcome.reasonIds).toContain("policy.material_fact_missing");
  });

  it("distinguishes an unresolved criterion from a known exclusion", () => {
    const unknown = labelFor({
      screening: screening([criterion("income", "pass"), criterion("age", "unknown")]),
      covered: true,
      staleEvidence: false,
      model: strongModel,
    });
    expect(unknown.label).toBe("possibly");
    expect(unknown.reasonIds).toContain("policy.unresolved_criterion");
    expect(unknown.reasonIds).not.toContain("policy.rule_exclusion");
  });

  it("blocks Likely for unsupported coverage and for stale evidence", () => {
    expect(
      labelFor({ screening: clean, covered: false, staleEvidence: false, model: strongModel })
        .reasonIds,
    ).toContain("policy.not_covered");
    expect(
      labelFor({ screening: clean, covered: true, staleEvidence: true, model: strongModel })
        .reasonIds,
    ).toContain("policy.stale_evidence");
  });

  it("holds the score and confidence boundaries exactly", () => {
    const at = labelFor({
      screening: clean,
      covered: true,
      staleEvidence: false,
      model: {
        score: DISPLAY_POLICY.likelyMinScore,
        confidence: DISPLAY_POLICY.likelyMinConfidence,
      },
    });
    expect(at.label).toBe("likely");

    const justUnderScore = labelFor({
      screening: clean,
      covered: true,
      staleEvidence: false,
      model: { score: 1.69, confidence: 0.95 },
    });
    expect(justUnderScore.label).toBe("possibly");

    const justUnderConfidence = labelFor({
      screening: clean,
      covered: true,
      staleEvidence: false,
      model: { score: 1.95, confidence: 0.79 },
    });
    expect(justUnderConfidence.label).toBe("possibly");
  });

  it("sends a low-confidence signal to review, never to a categorical denial", () => {
    const outcome = labelFor({
      screening: clean,
      covered: true,
      staleEvidence: false,
      model: { score: 1.9, confidence: 0.4 },
    });
    expect(outcome.label).toBe("notAClearMatch");
    expect(outcome.reasonIds).toEqual(["policy.low_confidence_review"]);
  });

  it("surfaces a contradiction between clean rules and a confident negative score", () => {
    const outcome = labelFor({
      screening: clean,
      covered: true,
      staleEvidence: false,
      model: { score: 0.1, confidence: 0.97 },
    });
    expect(outcome.label).toBe("notAClearMatch");
    expect(outcome.reasonIds).toEqual(["policy.signal_conflict"]);
  });

  it("labels from rules alone when the provider is unavailable", () => {
    const likely = labelFor({ screening: clean, covered: true, staleEvidence: false, model: null });
    expect(likely).toMatchObject({ label: "likely", rulesOnly: true });

    const uncertain = labelFor({
      screening: screening([criterion("income", "unknown")]),
      covered: true,
      staleEvidence: false,
      model: null,
    });
    expect(uncertain).toMatchObject({ label: "possibly", rulesOnly: true });

    const excluded = labelFor({
      screening: screening([criterion("income", "fail")]),
      covered: true,
      staleEvidence: false,
      model: null,
    });
    expect(excluded).toMatchObject({ label: "notAClearMatch", rulesOnly: true });
  });
});

describe("ranking", () => {
  const base = { relevance: 1, matchScore: 1.5 };

  it("sorts by label, then relevance, then score, then catalog order", () => {
    const ranked = rankResults([
      { programId: "a", label: "possibly", ...base, catalogIndex: 0 },
      { programId: "b", label: "likely", relevance: 1, matchScore: 1.8, catalogIndex: 1 },
      { programId: "c", label: "likely", relevance: 2, matchScore: 1.7, catalogIndex: 2 },
      { programId: "d", label: "notAClearMatch", ...base, catalogIndex: 3 },
    ] as const);
    expect(ranked.map((r) => r.programId)).toEqual(["c", "b", "a", "d"]);
    expect(ranked.map((r) => r.rank)).toEqual([0, 1, 2, 3]);
  });

  it("breaks an exact tie by stable catalog order", () => {
    const ranked = rankResults([
      { programId: "later", label: "possibly", ...base, catalogIndex: 5 },
      { programId: "earlier", label: "possibly", ...base, catalogIndex: 2 },
    ] as const);
    expect(ranked.map((r) => r.programId)).toEqual(["earlier", "later"]);
  });

  it("does not treat a missing score as a zero judgment", () => {
    const ranked = rankResults([
      { programId: "unknown", label: "likely", relevance: null, matchScore: null, catalogIndex: 0 },
      { programId: "scored", label: "likely", relevance: 0, matchScore: 0, catalogIndex: 1 },
    ] as const);
    // The unknown sorts after the known score but keeps its Likely label.
    expect(ranked.map((r) => r.programId)).toEqual(["scored", "unknown"]);
    expect(ranked[1]!.label).toBe("likely");
  });
});

describe("follow-up selection", () => {
  const fieldOrder = ["state", "householdSize", "ageBand", "income", "medicare.countableMonthly"];

  const results = [
    {
      programId: "snap",
      label: "possibly" as const,
      relevance: 2,
      missingFieldIds: ["income", "householdSize"],
    },
    {
      programId: "wic",
      label: "possibly" as const,
      relevance: 1,
      missingFieldIds: ["householdSize"],
    },
  ];

  it("prefers the field that unlocks the most programs", () => {
    const picks = selectFollowUps({ results, resolvedFieldIds: [], turn: 0, fieldOrder });
    expect(picks[0]!.fieldId).toBe("householdSize");
    expect(picks[0]!.unlocks).toBe(2);
  });

  it("prefers the lighter question when two unlock the same number", () => {
    const picks = selectFollowUps({
      results: [
        {
          programId: "snap",
          label: "possibly",
          relevance: 2,
          missingFieldIds: ["income", "ageBand"],
        },
      ],
      resolvedFieldIds: [],
      turn: 0,
      fieldOrder,
    });
    expect(picks.map((p) => p.fieldId)).toEqual(["ageBand", "income"]);
    expect(fieldBurden("ageBand")).toBeLessThan(fieldBurden("income"));
  });

  it("never asks a person to resolve an agency-only interpretation", () => {
    const picks = selectFollowUps({
      results: [
        {
          programId: "snap",
          label: "possibly",
          relevance: 2,
          missingFieldIds: AGENCY_ONLY_FIELD_IDS.slice(),
        },
      ],
      resolvedFieldIds: [],
      turn: 0,
      fieldOrder,
    });
    expect(picks).toEqual([]);
  });

  it("skips fields already answered or already asked", () => {
    const picks = selectFollowUps({
      results,
      resolvedFieldIds: ["householdSize"],
      turn: 0,
      fieldOrder,
    });
    expect(picks.map((p) => p.fieldId)).toEqual(["income"]);
  });

  it("does not let a program with no stated relevance drive questions", () => {
    const picks = selectFollowUps({
      results: [
        { programId: "lifeline", label: "possibly", relevance: 0, missingFieldIds: ["income"] },
      ],
      resolvedFieldIds: [],
      turn: 0,
      fieldOrder,
    });
    expect(picks).toEqual([]);
  });

  it("stops asking after the third turn so partial results can stand", () => {
    for (let turn = 0; turn < DISPLAY_POLICY.maxFollowUpTurns; turn++) {
      expect(
        selectFollowUps({ results, resolvedFieldIds: [], turn, fieldOrder }).length,
      ).toBeGreaterThan(0);
    }
    expect(
      selectFollowUps({
        results,
        resolvedFieldIds: [],
        turn: DISPLAY_POLICY.maxFollowUpTurns,
        fieldOrder,
      }),
    ).toEqual([]);
  });

  it("offers at most three fields in one turn", () => {
    const picks = selectFollowUps({
      results: [
        {
          programId: "snap",
          label: "possibly",
          relevance: 2,
          missingFieldIds: ["state", "householdSize", "ageBand", "income"],
        },
      ],
      resolvedFieldIds: [],
      turn: 0,
      fieldOrder,
    });
    expect(picks).toHaveLength(DISPLAY_POLICY.maxFollowUpsPerTurn);
  });
});

describe("uncertainty tie-break", () => {
  it("picks the support answer closest to 0.5", () => {
    expect(
      mostUncertainNoul([
        { id: "a", noul: 0.95 },
        { id: "b", noul: 0.52 },
        { id: "c", noul: 0.1 },
      ]),
    ).toBe("b");
  });

  it("returns nothing when there is no answer to weigh", () => {
    expect(mostUncertainNoul([])).toBeNull();
  });
});
