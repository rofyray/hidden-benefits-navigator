/**
 * WIC catalog checks. Two things matter most here: the category pathway and the
 * income pathway stay separate, and the app never infers a category or performs
 * the clinic's nutrition assessment.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { programSchema, sourceSchema, thresholdForHousehold } from "@/shared/catalog-schema";
import { wicCases } from "../fixtures/wic-cases";

const wic = programSchema.parse(
  JSON.parse(readFileSync("src/shared/catalog/programs/wic.json", "utf8")),
);
const sources: ReturnType<typeof sourceSchema.parse>[] = JSON.parse(
  readFileSync("src/shared/catalog/sources/wic.json", "utf8"),
).map((s: unknown) => sourceSchema.parse(s));

const ruleById = (id: string) => wic.rules.find((r) => r.id === id);

describe("WIC income table transcription", () => {
  const incomeRule = ruleById("rule.wic.income_table")!;
  const scale = (
    incomeRule.operands as {
      householdScale: Parameters<typeof thresholdForHousehold>[0] & { householdFieldId: string };
    }
  ).householdScale;

  it("matches the published monthly figures for households of one to six", () => {
    const expected = [246100, 333700, 421200, 508800, 596400, 683900];
    expected.forEach((cents, i) => {
      expect(thresholdForHousehold(scale, i + 1)).toBe(cents);
    });
  });

  it("stops at six rather than extrapolating beyond the published table", () => {
    expect(scale.additionalPerPersonCents).toBeNull();
    expect(thresholdForHousehold(scale, 7)).toBeNull();
  });

  it("reads gross monthly income against the household size WIC counts", () => {
    const ops = incomeRule.operands as { period: string; basis: string };
    expect(ops.period).toBe("monthly");
    expect(ops.basis).toBe("gross");
    expect(scale.householdFieldId).toBe("wic.applicableHouseholdSize");
  });
});

describe("WIC effective period is recorded honestly", () => {
  it("leaves the table undated instead of inventing an effective period", () => {
    const apply = sources.find((s) => s.id === "src.wic.apply")!;
    expect(apply.effectiveFrom).toBeNull();
    expect(apply.effectiveTo).toBeNull();
  });

  it("records the federal page that would date it as inaccessible", () => {
    const fns = sources.find((s) => s.id === "src.wic.fns_guidelines")!;
    expect(fns.reviewStatus).toBe("inaccessible");
    expect(fns.section).toMatch(/403/);
  });

  it("carries the caveat on the income rule itself and in the limitations", () => {
    expect(ruleById("rule.wic.income_table")!.evidenceIds).toContain("ev.wic.income_table_undated");
    expect(wic.limitations.join(" ")).toMatch(/effective period .* could not be confirmed/i);
    expect(wic.reviewDueOn).toBe("2026-12-19");
  });
});

describe("WIC keeps the category and income pathways separate", () => {
  it("decides the category only from stated category fields", () => {
    const category = ruleById("rule.wic.category")!;
    const members = (category.operands as { ruleIds: string[] }).ruleIds.map((id) => ruleById(id)!);
    expect(members.flatMap((r) => r.fieldIds).sort()).toEqual([
      "breastfeedingUnder12Months",
      "childUnder5",
      "postpartumUnder6Months",
      "pregnant",
    ]);
    for (const r of members) expect(r.blocksLikelyWhenUnknown).toBe(true);
  });

  it("never uses income or a benefit program to establish the category", () => {
    const category = ruleById("rule.wic.category")!;
    const members = (category.operands as { ruleIds: string[] }).ruleIds.map((id) => ruleById(id)!);
    for (const r of members) {
      for (const f of r.fieldIds) {
        expect(f).not.toMatch(/income|receives/i);
      }
    }
  });

  it("treats Medicaid, SNAP and TANF as an income exception, not a category", () => {
    const income = ruleById("rule.wic.income_table")!;
    expect(income.exceptionRuleIds).toContain("rule.wic.categorical_income");
    const categorical = ruleById("rule.wic.categorical_income")!;
    const members = (categorical.operands as { ruleIds: string[] }).ruleIds.map((id) =>
      ruleById(id)!,
    );
    expect(members.flatMap((r) => r.fieldIds).sort()).toEqual([
      "receivesMedicaid",
      "receivesSnap",
      "receivesTanf",
    ]);
  });
});

describe("WIC never does the clinic's job", () => {
  it("keeps the nutrition assessment as a clinic step, not a screened rule", () => {
    const assessment = ruleById("rule.wic.clinic_assessment_referral")!;
    expect(assessment.effect).toBe("referral");
    expect((assessment.operands as { reasonCode: string }).reasonCode).toBe(
      "nutrition_assessment_done_at_clinic",
    );
    expect(wic.limitations.join(" ")).toMatch(/nutritional risk is decided at the clinic/i);
  });

  it("never infers pregnancy or a nutritional determination", () => {
    expect(wic.limitations.join(" ")).toMatch(/never infers pregnancy/i);
    const text = JSON.stringify(wic);
    expect(text).not.toMatch(
      /(nutritional risk (is )?(met|found)|you (are|will be) approved|guaranteed)/i,
    );
  });

  it("sends people to a real Texas WIC route over https", () => {
    expect(wic.application.map((a) => a.url)).toEqual([
      "https://texaswic.org/apply",
      "https://office.texaswic.org/",
    ]);
  });

  it("refers rather than rejects when the household is larger than the table", () => {
    const referral = ruleById("rule.wic.large_household_referral")!;
    expect(referral.effect).toBe("referral");
    expect((referral.operands as { reasonCode: string }).reasonCode).toBe(
      "household_larger_than_published_table",
    );
    expect(referral.evidenceIds).toContain("ev.wic.expected_infants");
  });
});

describe("WIC documents and durations", () => {
  it("qualifies the income proof so people on Medicaid, SNAP or TANF are not asked for it", () => {
    const incomeDoc = wic.documents.find((d) => d.id === "doc.wic.income_proof")!;
    expect(incomeDoc.whenRuleId).toBe("rule.wic.income_table");
    expect(incomeDoc.requiredness).toBe("mayNeed");
    expect(incomeDoc.label).toMatch(/only if you are not already on Medicaid, SNAP or TANF/i);
    expect(wic.documents.some((d) => d.requiredness === "askAgency")).toBe(true);
  });

  it("records every published category duration", () => {
    const durations = wic.evidence.find((e) => e.id === "ev.wic.durations")!.text;
    expect(durations).toMatch(/until they turn 5/);
    expect(durations).toMatch(/end of the pregnancy/);
    expect(durations).toMatch(/1 year old/);
    expect(durations).toMatch(/6 months old/);
  });

  it("cites a source for every evidence record", () => {
    const ids = new Set(sources.map((s) => s.id));
    for (const e of wic.evidence) {
      expect(e.sourceIds.length).toBeGreaterThan(0);
      for (const sid of e.sourceIds) expect(ids.has(sid)).toBe(true);
    }
  });
});

describe("WIC fixtures", () => {
  it("covers both pathways plus the boundary and unknown cases", () => {
    expect(wicCases).toHaveLength(6);
    expect(new Set(wicCases.map((c) => c.pathway))).toEqual(
      new Set(["category", "incomeTable", "categoricalIncome"]),
    );
    expect(new Set(wicCases.map((c) => c.expectedLabel))).toEqual(
      new Set(["likely", "possibly", "notAClearMatch"]),
    );
  });

  it("never expects a strong match from an unstated category", () => {
    for (const c of wicCases) {
      const stated =
        c.facts.pregnant === "yes" ||
        c.facts.postpartumUnder6Months === "yes" ||
        c.facts.breastfeedingUnder12Months === "yes" ||
        c.facts.childUnder5 === "yes";
      if (!stated) expect(c.expectedLabel).not.toBe("likely");
    }
  });
});
