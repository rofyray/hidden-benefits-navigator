/**
 * SNAP catalog checks: table transcription, boundary arithmetic and fixture
 * integrity. The published figures below were transcribed by hand from the
 * Texas Works Handbook C-121 table (Revision 25-4, effective Oct. 1, 2025) and
 * are repeated here so a silent edit to the catalog fails the suite.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { programSchema, sourceSchema, thresholdForHousehold } from "@/shared/catalog-schema";
import { snapCases } from "../fixtures/snap-cases";

const snap = programSchema.parse(
  JSON.parse(readFileSync("src/shared/catalog/programs/snap.json", "utf8")),
);
const sources = JSON.parse(readFileSync("src/shared/catalog/sources/snap.json", "utf8")).map(
  (s: unknown) => sourceSchema.parse(s),
);

function scaleOf(ruleId: string) {
  const rule = snap.rules.find((r) => r.id === ruleId);
  if (!rule || rule.operator === "referral" || rule.operator === "enumIn") {
    throw new Error(`${ruleId} is not an amount rule`);
  }
  const operands = rule.operands as { householdScale: NonNullable<unknown> };
  const scale = operands.householdScale as {
    bySize: Record<string, number>;
    additionalPerPersonCents: number | null;
  };
  if (!scale) throw new Error(`${ruleId} has no household table`);
  return scale;
}

/** Published dollar figures, households 1..10, then the per-person increment. */
const published = {
  "rule.snap.gross130": [1696, 2292, 2888, 3483, 4079, 4675, 5271, 5867, 6463, 7059, 596],
  "rule.snap.net100": [1305, 1763, 2221, 2680, 3138, 3596, 4055, 4513, 4972, 5431, 459],
  "rule.snap.categorical165": [2152, 2909, 3665, 4421, 5177, 5934, 6690, 7446, 8203, 8960, 757],
};

describe("SNAP income table transcription", () => {
  for (const [ruleId, figures] of Object.entries(published)) {
    it(`${ruleId} matches the published figures`, () => {
      const scale = scaleOf(ruleId);
      for (let size = 1; size <= 10; size += 1) {
        expect(scale.bySize[String(size)]).toBe(figures[size - 1]! * 100);
      }
      expect(Object.keys(scale.bySize)).toHaveLength(10);
      expect(scale.additionalPerPersonCents).toBe(figures[10]! * 100);
    });
  }
});

describe("threshold lookup", () => {
  it("extends the table with the published per-person increment", () => {
    const scale = scaleOf("rule.snap.gross130");
    expect(thresholdForHousehold(scale, 10)).toBe(705900);
    expect(thresholdForHousehold(scale, 11)).toBe(705900 + 59600);
    expect(thresholdForHousehold(scale, 13)).toBe(705900 + 3 * 59600);
  });

  it("reports unknown rather than inventing a limit", () => {
    const scale = scaleOf("rule.snap.gross130");
    expect(thresholdForHousehold(scale, null)).toBeNull();
    expect(thresholdForHousehold(scale, -1)).toBeNull();
    expect(thresholdForHousehold(scale, 0)).toBeNull(); // no row for zero in the SNAP table
    expect(thresholdForHousehold(scale, 2.5)).toBeNull();
    expect(thresholdForHousehold({ bySize: {}, additionalPerPersonCents: null }, 3)).toBeNull();
  });
});

describe("SNAP catalog integrity", () => {
  it("does not let an unknown deduction produce a definitive exclusion", () => {
    const net = snap.rules.find((r) => r.id === "rule.snap.net100");
    expect(net?.blocksLikelyWhenUnknown).toBe(false);
    const gross = snap.rules.find((r) => r.id === "rule.snap.gross130");
    expect(gross?.exceptionRuleIds).toEqual([
      "rule.snap.categorical165",
      "rule.snap.older_or_disabled",
    ]);
  });

  it("keeps a referral path for the non-financial rules it does not screen", () => {
    const referral = snap.rules.find((r) => r.effect === "referral");
    expect(referral?.operator).toBe("referral");
  });

  it("records the October transition and the inaccessible overview page honestly", () => {
    expect(snap.reviewDueOn).toBe("2026-10-01");
    const overview = sources.find((s: { id: string }) => s.id === "src.snap.overview");
    expect(overview.reviewStatus).toBe("inaccessible");
    const claimsDocuments = snap.documents.some((d) => d.requiredness === "required");
    expect(claimsDocuments).toBe(false);
  });

  it("uses https for every source and application link", () => {
    for (const source of sources) expect(source.url.startsWith("https://")).toBe(true);
    for (const step of snap.application) expect(step.url.startsWith("https://")).toBe(true);
  });
});

describe("SNAP labeled fixtures", () => {
  it("provides six cases with unique ids", () => {
    expect(snapCases).toHaveLength(6);
    expect(new Set(snapCases.map((c) => c.id)).size).toBe(6);
  });

  it("only names rules that exist in the catalog", () => {
    const ruleIds = new Set(snap.rules.map((r) => r.id));
    for (const c of snapCases) {
      for (const id of c.decidingRuleIds) expect(ruleIds.has(id)).toBe(true);
    }
  });

  it("places the boundary cases on the intended side of the gross limit", () => {
    const limit = thresholdForHousehold(scaleOf("rule.snap.gross130"), 1)!;
    const under = snapCases.find((c) => c.id === "snap.just_under_gross_boundary")!;
    const over = snapCases.find((c) => c.id === "snap.just_over_gross_boundary")!;
    expect(under.facts.income!.interval.maxCents).toBe(limit - 1);
    expect(over.facts.income!.interval.minCents).toBe(limit + 1);
  });

  it("never labels an unknown-income or exception case as a clear match", () => {
    for (const c of snapCases) {
      const uncertain = c.expectedMissingFieldIds.length > 0;
      if (uncertain) expect(c.expectedLabel).not.toBe("likely");
    }
  });
});
