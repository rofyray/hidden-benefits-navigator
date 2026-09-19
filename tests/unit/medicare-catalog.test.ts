/**
 * Medicare cost-help catalog checks: MSP and Extra Help stay separate, the
 * 2026 figures are transcribed correctly, age alone never decides enrollment,
 * and unknown resources stay unknown.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { programSchema, sourceSchema } from "@/shared/catalog-schema";
import { medicareCases } from "../fixtures/medicare-cases";

const program = programSchema.parse(
  JSON.parse(readFileSync("src/shared/catalog/programs/medicare_help.json", "utf8")),
);
const sources: ReturnType<typeof sourceSchema.parse>[] = JSON.parse(
  readFileSync("src/shared/catalog/sources/medicare.json", "utf8"),
).map((s: unknown) => sourceSchema.parse(s));

const rule = (id: string) => program.rules.find((r) => r.id === id)!;
const amount = (id: string) => (rule(id).operands as { amountCents: number }).amountCents;
const evidence = (id: string) => program.evidence.find((e) => e.id === id)!;

describe("2026 figure transcription", () => {
  it("MSP monthly income limits", () => {
    expect(amount("rule.medicare.msp_qmb_income_ind")).toBe(135000);
    expect(amount("rule.medicare.msp_qmb_income_couple")).toBe(182400);
    expect(amount("rule.medicare.msp_slmb_income_ind")).toBe(161600);
    expect(amount("rule.medicare.msp_slmb_income_couple")).toBe(218400);
    expect(amount("rule.medicare.msp_qi_income_ind")).toBe(181600);
    expect(amount("rule.medicare.msp_qi_income_couple")).toBe(245500);
  });

  it("MSP resource limits", () => {
    expect(amount("rule.medicare.msp_resources_ind")).toBe(995000);
    expect(amount("rule.medicare.msp_resources_couple")).toBe(1491000);
  });

  it("Extra Help annual income and resource limits", () => {
    expect(amount("rule.medicare.extra_help_income_ind")).toBe(2394000);
    expect(amount("rule.medicare.extra_help_income_couple")).toBe(3246000);
    expect(amount("rule.medicare.extra_help_resources_ind")).toBe(1809000);
    expect(amount("rule.medicare.extra_help_resources_couple")).toBe(3610000);
  });

  it("keeps MSP monthly and Extra Help annual periods distinct", () => {
    for (const r of program.rules) {
      if (r.operator !== "lte") continue;
      const period = (r.operands as { period: string }).period;
      expect(r.id.includes("extra_help") ? "annual" : "monthly").toBe(period);
    }
  });
});

describe("MSP and Extra Help stay separate", () => {
  it("no rule mixes the two pathways' evidence", () => {
    for (const r of program.rules) {
      const mspEvidence = r.evidenceIds.some((e) => e.startsWith("ev.medicare.msp"));
      const ehEvidence = r.evidenceIds.some((e) => e.startsWith("ev.medicare.extra_help"));
      expect(mspEvidence && ehEvidence).toBe(false);
    }
  });

  it("no evidence record cites a figure from the other pathway", () => {
    expect(evidence("ev.medicare.msp_qmb").text).not.toMatch(/23,940|18,090/);
    expect(evidence("ev.medicare.extra_help_limits").text).not.toMatch(/1,350|9,950/);
    expect(evidence("ev.medicare.extra_help_limits").text).toMatch(/annual income figures/);
  });

  it("gives each pathway its own official destination", () => {
    expect(program.application.map((a) => a.id)).toEqual([
      "app.medicare.msp",
      "app.medicare.extra_help",
      "app.medicare.ssa",
    ]);
    for (const a of program.application) expect(a.url.startsWith("https://")).toBe(true);
  });

  it("records having an MSP as an Extra Help pathway, not as an MSP result", () => {
    const r = rule("rule.medicare.extra_help_has_msp");
    expect((r.operands as { fieldId: string }).fieldId).toBe("medicare.receivesMsp");
    expect(r.evidenceIds).toEqual(["ev.medicare.extra_help_automatic"]);
  });
});

describe("enrollment and uncertainty", () => {
  it("decides enrollment from Medicare facts, never from age", () => {
    const enrolled = rule("rule.medicare.enrolled");
    expect((enrolled.operands as { fieldId: string }).fieldId).toBe("medicarePartA");
    for (const r of program.rules) expect(r.fieldIds).not.toContain("ageBand");
    expect(program.requiredFieldIds).not.toContain("ageBand");
  });

  it("keeps unknown resources blocking a strong match", () => {
    for (const id of ["rule.medicare.msp_resources_ind", "rule.medicare.msp_resources_couple"]) {
      expect(rule(id).blocksLikelyWhenUnknown).toBe(true);
    }
    const unknown = medicareCases.find((c) => c.id === "medicare.msp_resources_unknown")!;
    expect(unknown.expectedLabel).toBe("possibly");
    expect(unknown.expectedMissingFieldIds).toContain("medicare.countableResources");
  });

  it("does not treat a federal limit as a denial", () => {
    for (const id of [
      "rule.medicare.msp_qmb_income_ind",
      "rule.medicare.msp_resources_ind",
      "rule.medicare.msp_qi_income_couple",
    ]) {
      expect(rule(id).exceptionRuleIds).toContain("rule.medicare.msp_state_variation_referral");
    }
    expect(program.fallbackExplanation).toMatch(/applying is worthwhile/);
  });

  it("refers the QDWI working-disability pathway instead of scoring it", () => {
    expect(rule("rule.medicare.msp_qdwi_referral").operator).toBe("referral");
  });

  it("records the pages it could not read", () => {
    expect(
      sources
        .filter((s) => s.reviewStatus === "inaccessible")
        .map((s) => s.id)
        .sort(),
    ).toEqual(["src.medicare.ssa_apply", "src.medicare.texas_msp"]);
  });
});

describe("Medicare labeled fixtures", () => {
  it("provides six unique cases across both pathways", () => {
    expect(medicareCases).toHaveLength(6);
    expect(new Set(medicareCases.map((c) => c.id)).size).toBe(6);
    expect(medicareCases.filter((c) => c.pathway === "msp").length).toBe(4);
    expect(medicareCases.filter((c) => c.pathway === "extraHelp").length).toBe(2);
    const ids = new Set(program.rules.map((r) => r.id));
    for (const c of medicareCases)
      for (const id of c.decidingRuleIds) expect(ids.has(id)).toBe(true);
  });

  it("places the boundary case between the QMB and SLMB limits", () => {
    const c = medicareCases.find((x) => x.id === "medicare.msp_subprogram_boundary")!;
    const monthly = c.extensions.medicare.countableMonthly!.maxCents!;
    expect(monthly).toBeGreaterThan(amount("rule.medicare.msp_qmb_income_ind"));
    expect(monthly).toBeLessThan(amount("rule.medicare.msp_slmb_income_ind"));
  });

  it("shows a case that clears Extra Help while failing the QMB income limit", () => {
    const c = medicareCases.find((x) => x.id === "medicare.extra_help_over_msp_under")!;
    expect(c.extensions.medicare.countableMonthly!.maxCents!).toBeGreaterThan(
      amount("rule.medicare.msp_qmb_income_ind"),
    );
    expect(c.extensions.medicare.extraHelpAnnualIncome!.maxCents!).toBeLessThan(
      amount("rule.medicare.extra_help_income_ind"),
    );
  });
});
