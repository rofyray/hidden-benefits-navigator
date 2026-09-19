/**
 * CEAP catalog checks. The state income guidelines are inaccessible, so these
 * tests exist mainly to keep the card honest: no invented income threshold, no
 * promise of funds, and a real official route to the local agency.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { programSchema, sourceSchema } from "@/shared/catalog-schema";
import { ceapCases } from "../fixtures/ceap-cases";

const ceap = programSchema.parse(
  JSON.parse(readFileSync("src/shared/catalog/programs/ceap.json", "utf8")),
);
const sources: ReturnType<typeof sourceSchema.parse>[] = JSON.parse(
  readFileSync("src/shared/catalog/sources/ceap.json", "utf8"),
).map((s: unknown) => sourceSchema.parse(s));

describe("CEAP honesty about the unreadable income guidelines", () => {
  it("records the blocked state pages as inaccessible rather than dropping them", () => {
    const blocked = sources.filter((s) => s.reviewStatus === "inaccessible");
    expect(blocked.map((s) => s.id).sort()).toEqual([
      "src.ceap.tdhca_income",
      "src.ceap.tdhca_program",
    ]);
    for (const s of blocked) expect(s.section).toMatch(/403/);
  });

  it("encodes no income threshold at all", () => {
    for (const rule of ceap.rules) {
      expect(["enumIn", "referral"]).toContain(rule.operator);
    }
    expect(JSON.stringify(ceap)).not.toMatch(/amountCents"\s*:\s*\d/);
  });

  it("cites the inaccessibility from the referral rule itself", () => {
    const referral = ceap.rules.find((r) => r.operator === "referral");
    expect(referral?.evidenceIds).toContain("ev.ceap.no_income_table");
    expect((referral?.operands as { reasonCode: string }).reasonCode).toBe(
      "income_rules_not_verifiable",
    );
  });
});

describe("CEAP promises", () => {
  it("promises neither an award nor available funds", () => {
    const forbidden = /(you will (get|receive)|guaranteed|approved|funds are available)/i;
    expect(ceap.value.text).not.toMatch(forbidden);
    expect(ceap.fallbackExplanation).not.toMatch(forbidden);
    for (const line of ceap.eligibilitySummary) expect(line).not.toMatch(forbidden);
    expect(ceap.limitations.join(" ")).toMatch(/funding is limited/i);
  });

  it("offers an actionable official route over https", () => {
    expect(ceap.application.map((a) => a.url)).toEqual([
      "https://www.211texas.org/",
      "https://www.usa.gov/help-with-energy-bills",
    ]);
    expect(ceap.application[0]!.label).toMatch(/2-1-1/);
  });

  it("does not name a specific county office it could not verify", () => {
    const serialized = JSON.stringify(ceap);
    expect(serialized).not.toMatch(/Denton|Collin/);
  });
});

describe("CEAP labeled fixtures", () => {
  it("provides six unique cases naming real rules", () => {
    expect(ceapCases).toHaveLength(6);
    expect(new Set(ceapCases.map((c) => c.id)).size).toBe(6);
    const ruleIds = new Set(ceap.rules.map((r) => r.id));
    for (const c of ceapCases)
      for (const id of c.decidingRuleIds) expect(ruleIds.has(id)).toBe(true);
  });

  it("never claims a strong match while the income rules are unverified", () => {
    for (const c of ceapCases) expect(c.expectedLabel).not.toBe("likely");
  });

  it("treats income as non-deciding in both directions", () => {
    const low = ceapCases.find((c) => c.id === "ceap.low_income_bill_holder")!;
    const high = ceapCases.find((c) => c.id === "ceap.high_income_still_referred")!;
    expect(high.expectedLabel).toBe(low.expectedLabel);
  });
});
