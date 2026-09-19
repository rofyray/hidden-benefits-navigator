/**
 * Threshold boundary regression for the display policy (P1-16).
 *
 * The labeled evaluation reports how the policy behaves on whole situations.
 * These tests pin the exact boundary values that evaluation relied on, so a
 * later edit to a threshold cannot pass unnoticed: each assertion states the
 * value it depends on rather than a bare number.
 */

import { describe, expect, it } from "vitest";
import { DISPLAY_POLICY, labelFor } from "@/server/jev/display";
import type { ProgramScreening } from "@/shared/screening";

/** A screening with positive evidence, no unknowns and no exclusion. */
const cleanScreening: ProgramScreening = {
  programId: "snap",
  applicable: true,
  criteria: [
    {
      id: "rule.test.pass",
      status: "pass",
      evidenceIds: ["ev.test"],
      reasonCode: "stated_value_matches",
      blocksLikely: true,
    },
  ],
  missingFieldIds: [],
  evidenceIds: ["ev.test"],
  reasonIds: ["stated_value_matches"],
};

const label = (score: number, confidence: number) =>
  labelFor({
    screening: cleanScreening,
    covered: true,
    staleEvidence: false,
    model: { score, confidence },
  });

const EPSILON = 0.01;

describe("display threshold boundaries", () => {
  it("reaches likely exactly at both likely thresholds", () => {
    const outcome = label(DISPLAY_POLICY.likelyMinScore, DISPLAY_POLICY.likelyMinConfidence);
    expect(outcome.label).toBe("likely");
    expect(outcome.reasonIds).toEqual(["policy.preliminary_match"]);
  });

  it("falls to possibly just below the likely score", () => {
    const outcome = label(
      DISPLAY_POLICY.likelyMinScore - EPSILON,
      DISPLAY_POLICY.likelyMinConfidence,
    );
    expect(outcome.label).toBe("possibly");
    expect(outcome.reasonIds).toEqual(["policy.confirm_a_detail"]);
  });

  it("falls to possibly just below the likely confidence", () => {
    const outcome = label(
      DISPLAY_POLICY.likelyMinScore,
      DISPLAY_POLICY.likelyMinConfidence - EPSILON,
    );
    expect(outcome.label).toBe("possibly");
    expect(outcome.reasonIds).toEqual(["policy.confirm_a_detail"]);
  });

  it("treats a score exactly at the contradiction ceiling as a signal conflict", () => {
    const outcome = label(DISPLAY_POLICY.contradictionMaxScore, DISPLAY_POLICY.likelyMinConfidence);
    expect(outcome.label).toBe("notAClearMatch");
    expect(outcome.reasonIds).toEqual(["policy.signal_conflict"]);
  });

  it("leaves the contradiction ceiling behind just above it", () => {
    const outcome = label(
      DISPLAY_POLICY.contradictionMaxScore + EPSILON,
      DISPLAY_POLICY.likelyMinConfidence,
    );
    expect(outcome.label).toBe("possibly");
    expect(outcome.reasonIds).toEqual(["policy.confirm_a_detail"]);
  });

  it("reads confidence exactly at the low-confidence floor as informative", () => {
    const outcome = label(DISPLAY_POLICY.likelyMinScore, DISPLAY_POLICY.lowConfidence);
    expect(outcome.label).toBe("possibly");
    expect(outcome.reasonIds).toEqual(["policy.confirm_a_detail"]);
  });

  it("discards the model signal just below the low-confidence floor", () => {
    const outcome = label(DISPLAY_POLICY.likelyMinScore, DISPLAY_POLICY.lowConfidence - EPSILON);
    expect(outcome.label).toBe("notAClearMatch");
    expect(outcome.reasonIds).toEqual(["policy.low_confidence_review"]);
  });

  it("caps a maximum signal at possibly when evidence is stale", () => {
    const outcome = labelFor({
      screening: cleanScreening,
      covered: true,
      staleEvidence: true,
      model: { score: 2, confidence: 1 },
    });
    expect(outcome.label).toBe("possibly");
    expect(outcome.reasonIds).toEqual(["policy.stale_evidence"]);
  });
});
