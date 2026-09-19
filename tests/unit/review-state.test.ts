/**
 * Review state tests.
 *
 * The cases that matter here are the ones a person would notice: an edit that
 * survives a late extraction result, an unknown that never becomes a guess, and
 * a network projection that cannot carry the narrative.
 */

import { describe, expect, it } from "vitest";
import {
  COMMON_FIELDS,
  GROUP_FIELDS,
  descriptorFor,
  fieldsForGroups,
  getFieldValue,
  initialReviewState,
  projectEvaluateRequest,
  reviewReducer,
  unreviewedPaths,
  type ReviewState,
} from "@/client/review";
import { emptyExtensions, emptyFacts, type FactRecord } from "@/client/extraction/validate";
import type { ExtractionRun } from "@/client/extraction/extract";
import type { ExtractionGroup } from "@/shared/extraction-schema";

const NARRATIVE = "I am Maria Testcase, I lost work in June and I have a two year old at home.";

function run(over: Partial<ExtractionRun> = {}): ExtractionRun {
  return {
    facts: emptyFacts(),
    extensions: emptyExtensions(),
    records: [],
    groupsAsked: ["snap", "lifeline"],
    outcomes: [],
    truncated: false,
    manualRequired: false,
    promptVersion: "1.0.0",
    ...over,
  };
}

function record(field: string, ambiguous = false): FactRecord {
  return { field, origin: "extracted", ambiguous };
}

function confirmed(state: ReviewState): ReviewState {
  return reviewReducer(state, { type: "confirm" });
}

describe("field descriptors", () => {
  it("offers an explicit unknown for every choice field", () => {
    const all = [
      ...COMMON_FIELDS,
      ...(Object.keys(GROUP_FIELDS) as ExtractionGroup[]).flatMap((g) => GROUP_FIELDS[g]),
    ];
    for (const field of all) {
      if (!field.options) continue;
      expect(
        field.options.some(
          (o) => o.value === "unknown" || o.value === "" || o.value === "unspecified",
        ),
        field.path,
      ).toBe(true);
    }
  });

  it("shows program-specific inputs only for groups that were asked", () => {
    const paths = fieldsForGroups(["wic"]).map((f) => f.path);
    expect(paths).toContain("wic.expectedInfants");
    expect(paths.some((p) => p.startsWith("eitc."))).toBe(false);
  });

  it("gives every field a plain label and a resolvable descriptor", () => {
    for (const field of fieldsForGroups(["snap", "eitc", "ceap", "medicare", "wic", "lifeline"])) {
      expect(field.label.length).toBeGreaterThan(3);
      expect(descriptorFor(field.path)?.path).toBe(field.path);
    }
  });
});

describe("review state", () => {
  it("keeps the narrative in memory and out of the projection", () => {
    let state = reviewReducer(initialReviewState(), { type: "setNarrative", text: NARRATIVE });
    state = reviewReducer(state, { type: "setField", path: "householdSize", value: 3 });
    const projection = projectEvaluateRequest(confirmed(state), {
      catalogVersion: "1.1.0",
      programIds: ["snap"],
    });
    expect(projection.ok).toBe(true);
    if (!projection.ok) return;
    const wire = JSON.stringify(projection.request);
    expect(state.narrative).toBe(NARRATIVE);
    expect(wire).not.toContain("Maria");
    expect(wire).not.toContain("Testcase");
    expect(wire).not.toContain("narrative");
    expect(Object.keys(projection.request).sort()).toEqual([
      "catalogVersion",
      "extensions",
      "facts",
      "programIds",
      "revision",
      "schemaVersion",
    ]);
  });

  it("omits source spans from the projection", () => {
    let state = reviewReducer(initialReviewState(), { type: "setNarrative", text: NARRATIVE });
    state = reviewReducer(state, {
      type: "applyExtraction",
      run: run({
        records: [record("childUnder5")],
        facts: { ...emptyFacts(), childUnder5: "yes" },
      }),
      forRevision: state.revision,
      spans: { childUnder5: { start: 40, end: 60 } },
    });
    expect(state.sourceSpans["childUnder5"]).toEqual({ start: 40, end: 60 });
    const projection = projectEvaluateRequest(confirmed(state), {
      catalogVersion: "1.1.0",
      programIds: ["wic"],
    });
    expect(projection.ok).toBe(true);
    if (!projection.ok) return;
    expect(JSON.stringify(projection.request)).not.toContain("start");
  });

  it("refuses to project before a person has confirmed", () => {
    const state = reviewReducer(initialReviewState(), {
      type: "setField",
      path: "householdSize",
      value: 2,
    });
    expect(
      projectEvaluateRequest(state, { catalogVersion: "1.1.0", programIds: ["snap"] }),
    ).toEqual({ ok: false, failure: "not_confirmed" });
  });

  it("keeps a manual edit when a late extraction result arrives", () => {
    let state = initialReviewState();
    state = reviewReducer(state, { type: "setField", path: "householdSize", value: 4 });
    state = reviewReducer(state, {
      type: "applyExtraction",
      run: run({
        facts: { ...emptyFacts(), householdSize: 1, childUnder5: "yes" },
        records: [record("householdSize"), record("childUnder5")],
      }),
      forRevision: state.revision,
    });
    expect(state.facts.householdSize).toBe(4);
    expect(state.origins["householdSize"]).toBe("manual");
    expect(state.facts.childUnder5).toBe("yes");
    expect(state.origins["childUnder5"]).toBe("extracted");
  });

  it("drops an extraction result computed for an older revision", () => {
    const state = reviewReducer(initialReviewState(), {
      type: "setField",
      path: "pregnant",
      value: "no",
    });
    const stale = state.revision - 1;
    const next = reviewReducer(state, {
      type: "applyExtraction",
      run: run({ facts: { ...emptyFacts(), pregnant: "yes" }, records: [record("pregnant")] }),
      forRevision: stale,
    });
    expect(next).toBe(state);
    expect(next.facts.pregnant).toBe("no");
  });

  it("refuses an out-of-contract edit and keeps the previous value", () => {
    let state = reviewReducer(initialReviewState(), {
      type: "setField",
      path: "householdSize",
      value: 3,
    });
    const revision = state.revision;
    state = reviewReducer(state, { type: "setField", path: "householdSize", value: 0 });
    expect(state.facts.householdSize).toBe(3);
    expect(state.revision).toBe(revision);
    expect(state.lastRejectedPath).toBe("householdSize");
  });

  it("refuses an out-of-contract program edit", () => {
    const state = reviewReducer(initialReviewState(), {
      type: "setField",
      path: "wic.expectedInfants",
      value: 99,
    });
    expect(getFieldValue(state, "wic.expectedInfants")).toBe(null);
    expect(state.lastRejectedPath).toBe("wic.expectedInfants");
  });

  it("accepts an unknown as an answer without inventing a value", () => {
    const state = reviewReducer(initialReviewState(), {
      type: "setField",
      path: "medicarePartA",
      value: "unknown",
    });
    expect(state.facts.medicarePartA).toBe("unknown");
    expect(state.origins["medicarePartA"]).toBe("manual");
  });

  it("marks an ambiguous amount for asking and clears it once answered", () => {
    let state = reviewReducer(initialReviewState(), {
      type: "applyExtraction",
      run: run({
        facts: {
          ...emptyFacts(),
          income: {
            interval: { minCents: 100_000, maxCents: 200_000 },
            period: "monthly",
            basis: "unknown",
          },
        },
        records: [record("income", true)],
      }),
      forRevision: 0,
    });
    expect(state.ambiguous["income"]).toBe(true);
    state = reviewReducer(state, {
      type: "setField",
      path: "income",
      value: {
        interval: { minCents: 150_000, maxCents: 150_000 },
        period: "monthly",
        basis: "gross",
      },
    });
    expect(state.ambiguous["income"]).toBeUndefined();
  });

  it("turns reviewed proposals into confirmed facts and leaves manual edits alone", () => {
    let state = reviewReducer(initialReviewState(), {
      type: "applyExtraction",
      run: run({ facts: { ...emptyFacts(), pregnant: "yes" }, records: [record("pregnant")] }),
      forRevision: 0,
    });
    state = reviewReducer(state, { type: "setField", path: "householdSize", value: 2 });
    state = confirmed(state);
    expect(state.origins["pregnant"]).toBe("confirmed");
    expect(state.origins["householdSize"]).toBe("manual");
    expect(state.confirmed).toBe(true);
  });

  it("stops being confirmed as soon as anything changes again", () => {
    let state = confirmed(
      reviewReducer(initialReviewState(), { type: "setField", path: "pregnant", value: "no" }),
    );
    state = reviewReducer(state, { type: "setField", path: "pregnant", value: "yes" });
    expect(state.confirmed).toBe(false);
  });

  it("lists what still needs a look", () => {
    let state = reviewReducer(initialReviewState(), {
      type: "applyExtraction",
      run: run({ facts: { ...emptyFacts(), pregnant: "yes" }, records: [record("pregnant")] }),
      forRevision: 0,
    });
    state = reviewReducer(state, { type: "setField", path: "childUnder5", value: "no" });
    expect(unreviewedPaths(state, ["pregnant", "childUnder5", "householdSize"])).toEqual([
      "pregnant",
      "householdSize",
    ]);
  });

  it("carries the manual-only path through when extraction produced nothing", () => {
    const state = reviewReducer(initialReviewState(), {
      type: "applyExtraction",
      run: run({ manualRequired: true }),
      forRevision: 0,
    });
    expect(state.manualRequired).toBe(true);
    expect(state.facts).toEqual(emptyFacts());
  });

  it("clears everything on reset, narrative included", () => {
    let state = reviewReducer(initialReviewState(), { type: "setNarrative", text: NARRATIVE });
    state = reviewReducer(state, { type: "setField", path: "householdSize", value: 5 });
    state = reviewReducer(state, { type: "reset" });
    expect(state).toEqual(initialReviewState());
  });
});
