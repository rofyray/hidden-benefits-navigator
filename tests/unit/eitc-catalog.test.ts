/**
 * EITC catalog checks: tax-year specificity, filing-status and child-count
 * distinctions, transcription of the published 2025 figures, and the rule that
 * maximum credit amounts are never presented as guaranteed awards.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { programSchema, sourceSchema, thresholdForHousehold } from "@/shared/catalog-schema";
import { eitcCases } from "../fixtures/eitc-cases";

const eitc = programSchema.parse(
  JSON.parse(readFileSync("src/shared/catalog/programs/eitc.json", "utf8")),
);
const sources = JSON.parse(readFileSync("src/shared/catalog/sources/eitc.json", "utf8")).map(
  (s: unknown) => sourceSchema.parse(s),
);

function scaleOf(ruleId: string) {
  const rule = eitc.rules.find((r) => r.id === ruleId);
  const operands = rule?.operands as {
    householdScale: { bySize: Record<string, number>; additionalPerPersonCents: number | null };
    taxYear?: number;
  };
  return operands.householdScale;
}

/** Published tax year 2025 AGI limits, children 0..3. */
const published = {
  "rule.eitc.agi_single_0": [19104, 50434, 57310, 61555],
  "rule.eitc.agi_joint": [26214, 57554, 64430, 68675],
};

describe("EITC 2025 table transcription", () => {
  for (const [ruleId, figures] of Object.entries(published)) {
    it(`${ruleId} matches the published figures`, () => {
      const scale = scaleOf(ruleId);
      figures.forEach((dollars, children) => {
        expect(scale.bySize[String(children)]).toBe(dollars * 100);
      });
      expect(Object.keys(scale.bySize)).toHaveLength(4);
      expect(scale.additionalPerPersonCents).toBeNull();
    });
  }

  it("does not extend the table beyond three or more children", () => {
    expect(thresholdForHousehold(scaleOf("rule.eitc.agi_joint"), 4)).toBeNull();
    expect(thresholdForHousehold(scaleOf("rule.eitc.agi_joint"), 0)).toBe(2621400);
  });
});

describe("EITC tax-year specificity", () => {
  it("names the supported tax year on every amount rule", () => {
    for (const rule of eitc.rules) {
      if (rule.operator === "referral" || rule.operator === "enumIn") continue;
      const operands = rule.operands as { period: string; taxYear?: number };
      expect(operands.period).toBe("taxYear");
      expect(operands.taxYear).toBe(2025);
    }
  });

  it("treats an unstated tax year as a reason to review, not to proceed", () => {
    const rule = eitc.rules.find((r) => r.id === "rule.eitc.taxyear2025");
    expect(rule?.blocksLikelyWhenUnknown).toBe(true);
    const unknownYear = eitcCases.find((c) => c.id === "eitc.tax_year_unknown")!;
    expect(unknownYear.expectedLabel).not.toBe("likely");
  });
});

describe("EITC presentation safety", () => {
  it("presents maximum credits as ceilings, not guaranteed awards", () => {
    expect(eitc.value.text).toMatch(/ceilings, not amounts you are guaranteed/);
    const forbidden = /(you will (get|receive)|guaranteed|approved for)/i;
    expect(eitc.fallbackExplanation).not.toMatch(forbidden);
    for (const line of eitc.eligibilitySummary) expect(line).not.toMatch(forbidden);
  });

  it("collects no Social Security numbers and says so in the checklist", () => {
    const ssn = eitc.documents.find((d) => d.id === "doc.eitc.ssn_note");
    expect(ssn?.label).toMatch(/do not enter it here/);
    const serialized = JSON.stringify(eitc).toLowerCase();
    expect(serialized).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
  });

  it("uses https for every source and destination", () => {
    for (const source of sources) expect(source.url.startsWith("https://")).toBe(true);
    for (const step of eitc.application) expect(step.url.startsWith("https://")).toBe(true);
  });
});

describe("EITC labeled fixtures", () => {
  it("provides six cases with unique ids naming real rules", () => {
    expect(eitcCases).toHaveLength(6);
    expect(new Set(eitcCases.map((c) => c.id)).size).toBe(6);
    const ruleIds = new Set(eitc.rules.map((r) => r.id));
    for (const c of eitcCases) {
      for (const id of c.decidingRuleIds) expect(ruleIds.has(id)).toBe(true);
    }
  });

  it("distinguishes filing status at the same income and child count", () => {
    const joint = eitcCases.find((c) => c.id === "eitc.joint_limit_differs_from_single")!;
    const agi = joint.extensions.eitc.agiAnnual!.maxCents!;
    expect(agi).toBeGreaterThan(scaleOf("rule.eitc.agi_single_0").bySize["2"]!);
    expect(agi).toBeLessThan(scaleOf("rule.eitc.agi_joint").bySize["2"]!);
  });

  it("distinguishes child count at the same income and filing status", () => {
    const c = eitcCases.find((x) => x.id === "eitc.child_count_changes_outcome")!;
    const agi = c.extensions.eitc.agiAnnual!.maxCents!;
    const single = scaleOf("rule.eitc.agi_single_0").bySize;
    expect(agi).toBeGreaterThan(single["1"]!);
    expect(agi).toBeLessThan(single["2"]!);
  });

  it("contains no Social Security numbers", () => {
    expect(JSON.stringify(eitcCases)).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
  });
});
