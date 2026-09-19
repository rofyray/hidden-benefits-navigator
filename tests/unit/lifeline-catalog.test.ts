/**
 * Lifeline catalog checks. The load-bearing rule is that an app-suggested SNAP
 * match is never treated as SNAP enrollment, and that Texas users get the route
 * USAC actually publishes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { programSchema, sourceSchema, thresholdForHousehold } from "@/shared/catalog-schema";
import { lifelineCases } from "../fixtures/lifeline-cases";

const lifeline = programSchema.parse(
  JSON.parse(readFileSync("src/shared/catalog/programs/lifeline.json", "utf8")),
);
const sources: ReturnType<typeof sourceSchema.parse>[] = JSON.parse(
  readFileSync("src/shared/catalog/sources/lifeline.json", "utf8"),
).map((s: unknown) => sourceSchema.parse(s));

const ruleById = (id: string) => lifeline.rules.find((r) => r.id === id);
const incomeRule = ruleById("rule.lifeline.income_table")!;
const scale = (
  incomeRule.operands as {
    householdScale: Parameters<typeof thresholdForHousehold>[0] & { householdFieldId: string };
  }
).householdScale;

describe("Lifeline income table", () => {
  it("matches the published 2026 contiguous-states figures for one to eight people", () => {
    const expected = [2154600, 2921400, 3688200, 4455000, 5221800, 5988600, 6755400, 7522200];
    expected.forEach((cents, i) => expect(thresholdForHousehold(scale, i + 1)).toBe(cents));
  });

  it("extends past eight with the published per-person increment", () => {
    expect(scale.additionalPerPersonCents).toBe(766800);
    expect(thresholdForHousehold(scale, 9)).toBe(7522200 + 766800);
    expect(thresholdForHousehold(scale, 11)).toBe(7522200 + 3 * 766800);
  });

  it("reads annual gross income against the economic household size", () => {
    const ops = incomeRule.operands as { period: string; basis: string };
    expect(ops.period).toBe("annual");
    expect(ops.basis).toBe("gross");
    expect(scale.householdFieldId).toBe("lifeline.economicHouseholdSize");
  });

  it("names the 135% rule and the non-contiguous-state caveat", () => {
    expect(lifeline.evidence.find((e) => e.id === "ev.lifeline.income_rule")!.text).toMatch(/135%/);
    expect(lifeline.limitations.join(" ")).toMatch(/Alaska and Hawaii/);
  });
});

describe("Lifeline never confuses a prediction with an enrollment", () => {
  it("reads only stated enrollment facts on the participation route", () => {
    const members = (
      ruleById("rule.lifeline.participation")!.operands as { ruleIds: string[] }
    ).ruleIds.map((id) => ruleById(id)!);
    expect(members.flatMap((r) => r.fieldIds).sort()).toEqual([
      "receivesHousingAid",
      "receivesMedicaid",
      "receivesSnap",
      "receivesSsi",
      "receivesVeteransPension",
    ]);
    for (const r of members) {
      expect(r.blocksLikelyWhenUnknown).toBe(true);
      expect(r.evidenceIds).toContain("ev.lifeline.participation_is_enrollment");
    }
  });

  it("states the prediction-is-not-enrollment limit in plain language", () => {
    expect(lifeline.limitations[0]).toMatch(/is not enrollment/i);
  });

  it("keeps a predicted-but-not-enrolled fixture out of a strong match", () => {
    const predicted = lifelineCases.find((c) => c.id === "lifeline.snap_predicted_not_enrolled")!;
    expect(predicted.facts.receivesSnap).toBe("no");
    expect(predicted.expectedLabel).not.toBe("likely");
  });
});

describe("Lifeline duplicate benefit and household", () => {
  it("treats an existing Lifeline benefit as an exclusion", () => {
    const dup = ruleById("rule.lifeline.one_per_household")!;
    expect(dup.effect).toBe("exclusion");
    expect(dup.fieldIds).toEqual(["existingLifeline"]);
    expect(lifeline.eligibilitySummary.join(" ")).toMatch(
      /one Lifeline discount .* per household/i,
    );
  });

  it("leaves the economic household definition to the program", () => {
    const ref = ruleById("rule.lifeline.household_definition_referral")!;
    expect(ref.effect).toBe("referral");
    expect((ref.operands as { reasonCode: string }).reasonCode).toBe(
      "economic_household_defined_by_program",
    );
    expect(incomeRule.exceptionRuleIds).toContain("rule.lifeline.household_definition_referral");
  });

  it("keeps the survivor and Tribal pathways as referrals, not screened rules", () => {
    for (const id of ["rule.lifeline.survivor_referral", "rule.lifeline.tribal_referral"]) {
      expect(ruleById(id)!.effect).toBe("referral");
      expect(ruleById(id)!.operator).toBe("referral");
    }
    expect(lifeline.limitations.join(" ")).toMatch(/survivor pathway/i);
  });
});

describe("Lifeline Texas route", () => {
  it("routes Texas to the destination USAC publishes", () => {
    expect(lifeline.application[0]!.url).toBe("https://www.texaslifeline.org/");
    expect(lifeline.application[0]!.evidenceIds).toContain("ev.lifeline.texas_route");
    const route = lifeline.evidence.find((e) => e.id === "ev.lifeline.texas_route")!;
    expect(route.sourceIds).toContain("src.lifeline.apply");
    expect(sources.find((s) => s.id === "src.lifeline.apply")!.reviewStatus).toBe("verified");
  });

  it("records the unreadable state site instead of inventing its steps", () => {
    const tx = sources.find((s) => s.id === "src.lifeline.texas")!;
    expect(tx.reviewStatus).toBe("inaccessible");
    expect(tx.section).toMatch(/403/);
    const askDoc = lifeline.documents.find((d) => d.id === "doc.lifeline.ask_texas")!;
    expect(askDoc.requiredness).toBe("askAgency");
  });

  it("offers national fallback routes over https", () => {
    for (const a of lifeline.application) expect(a.url).toMatch(/^https:\/\//);
    expect(lifeline.application.map((a) => a.id)).toContain("app.lifeline.companies");
  });
});

describe("Lifeline value copy is service-specific", () => {
  it("separates internet or bundled service from voice-only, and caps with 'up to'", () => {
    expect(lifeline.value.text).toMatch(/\$9\.25/);
    expect(lifeline.value.text).toMatch(/\$5\.25/);
    expect(lifeline.value.text).toMatch(/\$34\.25/);
    expect(lifeline.value.text).toMatch(/up to/i);
    expect(lifeline.value.text).not.toMatch(/(you will (get|receive)|guaranteed)/i);
  });

  it("conditions each proof option on the pathway that needs it", () => {
    expect(lifeline.documents.find((d) => d.id === "doc.lifeline.program_proof")!.whenRuleId).toBe(
      "rule.lifeline.participation",
    );
    expect(lifeline.documents.find((d) => d.id === "doc.lifeline.income_proof")!.whenRuleId).toBe(
      "rule.lifeline.income_table",
    );
  });

  it("cites a known source for every evidence record", () => {
    const ids = new Set(sources.map((s) => s.id));
    for (const e of lifeline.evidence) {
      expect(e.sourceIds.length).toBeGreaterThan(0);
      for (const sid of e.sourceIds) expect(ids.has(sid)).toBe(true);
    }
  });
});

describe("Lifeline fixtures", () => {
  it("covers enrollment-vs-prediction, duplicate benefit, household and income boundaries", () => {
    expect(lifelineCases).toHaveLength(6);
    expect(new Set(lifelineCases.map((c) => c.pathway))).toEqual(
      new Set(["participation", "income", "duplicate", "household"]),
    );
    expect(new Set(lifelineCases.map((c) => c.expectedLabel))).toEqual(
      new Set(["likely", "possibly", "notAClearMatch"]),
    );
  });

  it("puts the income boundary fixture just over the published limit", () => {
    const over = lifelineCases.find((c) => c.id === "lifeline.income_just_over_limit")!;
    expect(over.facts.income!.interval.minCents).toBeGreaterThan(thresholdForHousehold(scale, 1)!);
  });
});
