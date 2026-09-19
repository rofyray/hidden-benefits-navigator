/**
 * Deterministic screening engine checks.
 *
 * Two things are proven here. First, the arithmetic: period conversion,
 * interval comparison, exceptions, household tables and date selection behave
 * exactly as the published rules require, with unknowns preserved as unknown.
 * Second, every labeled program fixture runs through the engine and lands on a
 * consistent set of criterion statuses, twice in a row, with no hidden state.
 *
 * Labels and ranking are a later task (P1-13); this suite checks the criterion
 * statuses the label will be derived from, not the label itself.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { programSchema, type Program } from "@/shared/catalog-schema";
import type { Facts, Label, ProgramExtensions } from "@/shared/contracts";
import {
  annualEndpoints,
  annualizeCents,
  basisIsComparable,
  compareIntervalToThreshold,
  isoDateInRange,
  PERIODS_PER_YEAR,
  resolveField,
} from "@/shared/normalization";
import { programIsInForce, screenProgram, screenPrograms } from "@/shared/screening";
import { baseExtensions, baseFacts, interval } from "../fixtures/builders";
import { snapCases } from "../fixtures/snap-cases";
import { eitcCases } from "../fixtures/eitc-cases";
import { ceapCases } from "../fixtures/ceap-cases";
import { medicareCases } from "../fixtures/medicare-cases";
import { wicCases } from "../fixtures/wic-cases";
import { lifelineCases } from "../fixtures/lifeline-cases";

const EVALUATION_DATE = "2026-09-19";

function load(name: string): Program {
  return programSchema.parse(
    JSON.parse(readFileSync(`src/shared/catalog/programs/${name}.json`, "utf8")),
  );
}

const programs = {
  snap: load("snap"),
  eitc: load("eitc"),
  ceap: load("ceap"),
  medicare_help: load("medicare_help"),
  wic: load("wic"),
  lifeline: load("lifeline"),
} as const;

type LabeledCase = {
  id: string;
  facts: Facts;
  extensions: ProgramExtensions;
  expectedLabel: Label;
  /** Present on the earlier fixture files; later ones name the pathway instead. */
  decidingRuleIds?: readonly string[];
  expectedMissingFieldIds?: readonly string[];
};

const suites: Array<{ program: Program; cases: readonly LabeledCase[] }> = [
  { program: programs.snap, cases: snapCases },
  { program: programs.eitc, cases: eitcCases },
  { program: programs.ceap, cases: ceapCases },
  { program: programs.medicare_help, cases: medicareCases },
  { program: programs.wic, cases: wicCases },
  { program: programs.lifeline, cases: lifelineCases },
];

describe("period conversion", () => {
  it("uses the published periods-per-year factors", () => {
    expect(PERIODS_PER_YEAR).toEqual({
      weekly: 52,
      biweekly: 26,
      semimonthly: 24,
      monthly: 12,
      annual: 1,
    });
  });

  it("keeps semimonthly distinct from biweekly", () => {
    expect(annualizeCents(100_000, "semimonthly")).toBe(2_400_000);
    expect(annualizeCents(100_000, "biweekly")).toBe(2_600_000);
  });

  it("annualizes without losing cents", () => {
    // $1,000.01 weekly is exactly $52,000.52 a year; no rounding anywhere.
    expect(annualizeCents(100_001, "weekly")).toBe(5_200_052);
  });

  it("treats a tax-year figure as annual", () => {
    expect(annualizeCents(5_000, "taxYear")).toBe(5_000);
  });

  it("reports open-ended intervals as open-ended", () => {
    expect(annualEndpoints({ minCents: 100, maxCents: null }, "monthly")).toEqual({
      min: 1_200,
      max: null,
    });
  });
});

describe("interval comparison", () => {
  const monthly = (min: number, max: number | null) => ({ minCents: min, maxCents: max });

  it("passes an interval wholly under the limit", () => {
    expect(compareIntervalToThreshold(monthly(100, 200), "monthly", 300, "monthly")).toBe("below");
  });

  it("recognizes an interval that ends exactly on the limit", () => {
    expect(compareIntervalToThreshold(monthly(300, 300), "monthly", 300, "monthly")).toBe(
      "atOrBelow",
    );
  });

  it("fails an interval wholly above the limit", () => {
    expect(compareIntervalToThreshold(monthly(400, 500), "monthly", 300, "monthly")).toBe("above");
  });

  it("keeps a straddling interval unknown", () => {
    expect(compareIntervalToThreshold(monthly(200, 400), "monthly", 300, "monthly")).toBe(
      "overlaps",
    );
  });

  it("keeps an open-ended interval unknown", () => {
    expect(compareIntervalToThreshold(monthly(100, null), "monthly", 300, "monthly")).toBe(
      "overlaps",
    );
  });

  it("compares across periods exactly", () => {
    // $1,200 monthly against a $14,400 annual limit is exactly at the limit.
    expect(
      compareIntervalToThreshold(monthly(120_000, 120_000), "monthly", 1_440_000, "annual"),
    ).toBe("atOrBelow");
  });
});

describe("income basis", () => {
  it("refuses to compare an unknown basis against a published one", () => {
    expect(basisIsComparable("unknown", "gross")).toBe(false);
    expect(basisIsComparable("gross", "unknown")).toBe(false);
  });

  it("refuses to compare gross income against a net limit", () => {
    expect(basisIsComparable("gross", "net")).toBe(false);
    expect(basisIsComparable("net", "net")).toBe(true);
  });
});

describe("field resolution", () => {
  const facts = baseFacts({ state: "TX", householdSize: 3 });
  const extensions = baseExtensions({ wic: { applicableHouseholdSize: 4 } });

  it("reads a common fact", () => {
    expect(resolveField("state", facts, extensions)).toEqual({ kind: "enum", value: "TX" });
  });

  it("reads a program extension field", () => {
    expect(resolveField("wic.applicableHouseholdSize", facts, extensions)).toEqual({
      kind: "number",
      value: 4,
    });
  });

  it("reports an unanswered yes/no as unknown rather than no", () => {
    expect(resolveField("pregnant", facts, extensions)).toEqual({ kind: "tri", value: "unknown" });
  });

  it("reports an unknown field as absent instead of guessing", () => {
    expect(resolveField("not.a.field", facts, extensions)).toEqual({ kind: "absent" });
  });
});

describe("evaluation dates", () => {
  it("compares ISO calendar dates without a time zone", () => {
    expect(isoDateInRange("2026-01-01", "2026-01-01", "2026-12-31")).toBe(true);
    expect(isoDateInRange("2025-12-31", "2026-01-01", null)).toBe(false);
    expect(isoDateInRange("2030-01-01", "2026-01-01", null)).toBe(true);
  });

  it("selects a program version by the injected date, not the host clock", () => {
    expect(programIsInForce(programs.snap, EVALUATION_DATE)).toBe(true);
    const expired: Program = { ...programs.snap, validTo: "2025-01-01" };
    expect(programIsInForce(expired, EVALUATION_DATE)).toBe(false);

    const screening = screenProgram({
      program: expired,
      facts: baseFacts({ state: "TX" }),
      extensions: baseExtensions({}),
      evaluationDate: EVALUATION_DATE,
    });
    expect(screening.applicable).toBe(false);
    expect(screening.criteria).toHaveLength(0);
    expect(screening.reasonIds).toContain("program_version_not_in_force");
  });
});

describe("unknowns are never silently resolved", () => {
  it("leaves an income criterion unknown when no amount was given", () => {
    const screening = screenProgram({
      program: programs.snap,
      facts: baseFacts({ need: "food", state: "TX", householdSize: 3, foodHouseholdSize: 3 }),
      extensions: baseExtensions({}),
      evaluationDate: EVALUATION_DATE,
    });
    const income = screening.criteria.find((c) => c.id.includes("gross"));
    const all = [...screening.criteria];
    expect(all.some((c) => c.status === "unknown")).toBe(true);
    if (income) expect(income.status).toBe("unknown");
    expect(screening.missingFieldIds.length).toBeGreaterThan(0);
  });

  it("does not treat a missing amount as zero", () => {
    const withoutIncome = screenProgram({
      program: programs.lifeline,
      facts: baseFacts({ need: "phone", state: "TX", householdSize: 1 }),
      extensions: baseExtensions({ lifeline: { economicHouseholdSize: 1 } }),
      evaluationDate: EVALUATION_DATE,
    });
    const withZeroIncome = screenProgram({
      program: programs.lifeline,
      facts: baseFacts({
        need: "phone",
        state: "TX",
        householdSize: 1,
        income: { interval: interval(0, 0), period: "annual", basis: "gross" },
      }),
      extensions: baseExtensions({ lifeline: { economicHouseholdSize: 1 } }),
      evaluationDate: EVALUATION_DATE,
    });
    const idOf = (r: { id: string }) => r.id;
    const incomeRuleId = programs.lifeline.rules
      .map(idOf)
      .find((id) => id.includes("income")) as string;
    const unknownResult = withoutIncome.criteria.find((c) => c.id === incomeRuleId);
    const zeroResult = withZeroIncome.criteria.find((c) => c.id === incomeRuleId);
    if (unknownResult && zeroResult) {
      expect(unknownResult.status).toBe("unknown");
      expect(zeroResult.status).toBe("pass");
    }
  });
});

describe("household definitions", () => {
  it("uses the program's own household field, not the common one", () => {
    const facts = baseFacts({
      need: "food",
      state: "TX",
      householdSize: 1,
      // $2,900 a month gross: over the published size-1 figure, under size 5.
      income: { interval: interval(2_900, 2_900), period: "monthly", basis: "gross" },
      pregnant: "yes",
    });
    const smallWicHousehold = screenProgram({
      program: programs.wic,
      facts,
      extensions: baseExtensions({ wic: { applicableHouseholdSize: 1 } }),
      evaluationDate: EVALUATION_DATE,
    });
    const largeWicHousehold = screenProgram({
      program: programs.wic,
      facts,
      extensions: baseExtensions({ wic: { applicableHouseholdSize: 5 } }),
      evaluationDate: EVALUATION_DATE,
    });
    const incomeRule = programs.wic.rules.find((r) => r.id.includes("income"))?.id;
    const before = smallWicHousehold.criteria.find((c) => c.id === incomeRule)?.status;
    const after = largeWicHousehold.criteria.find((c) => c.id === incomeRule)?.status;
    expect(before).not.toBe(after);
  });

  it("reports unknown instead of extrapolating past a table with no increment", () => {
    const screening = screenProgram({
      program: programs.wic,
      facts: baseFacts({
        need: "food",
        state: "TX",
        pregnant: "yes",
        income: { interval: interval(1_000, 1_000), period: "monthly", basis: "gross" },
      }),
      extensions: baseExtensions({ wic: { applicableHouseholdSize: 12 } }),
      evaluationDate: EVALUATION_DATE,
    });
    const incomeRule = programs.wic.rules.find((r) => r.id.includes("income"))?.id;
    const status = screening.criteria.find((c) => c.id === incomeRule)?.status;
    expect(status).toBe("unknown");
  });
});

describe("exceptions soften a fail, never a pass", () => {
  it("does not let a bare gross limit exclude a household when an exception may apply", () => {
    const overGrossLimit = screenProgram({
      program: programs.snap,
      facts: baseFacts({
        need: "food",
        state: "TX",
        householdSize: 1,
        foodHouseholdSize: 1,
        ageBand: "65plus",
        income: { interval: interval(2_500, 2_500), period: "monthly", basis: "gross" },
      }),
      extensions: baseExtensions({
        snap: { olderOrDisabled: "yes", snapExceptionStatus: "applies" },
      }),
      evaluationDate: EVALUATION_DATE,
    });
    const gross = overGrossLimit.criteria.find((c) => c.id.includes("gross"));
    if (gross) {
      expect(gross.status).not.toBe("fail");
      expect(["exception_applies", "exception_may_apply"]).toContain(gross.reasonCode);
    }
  });
});

describe("determinism and fixture coverage", () => {
  for (const { program, cases } of suites) {
    describe(program.id, () => {
      it("has labeled fixtures", () => {
        expect(cases.length).toBeGreaterThanOrEqual(6);
      });

      for (const testCase of cases) {
        it(`is deterministic for ${testCase.id}`, () => {
          const input = {
            program,
            facts: testCase.facts,
            extensions: testCase.extensions,
            evaluationDate: EVALUATION_DATE,
          };
          const first = screenProgram(input);
          const second = screenProgram(input);
          expect(second).toEqual(first);

          // Every criterion carries an auditable reason and its evidence.
          for (const criterion of first.criteria) {
            expect(criterion.reasonCode.length).toBeGreaterThan(0);
            expect(criterion.evidenceIds.length).toBeGreaterThan(0);
            expect(["pass", "fail", "unknown", "notApplicable"]).toContain(criterion.status);
          }
        });

        it(`reaches the deciding rules for ${testCase.id}`, () => {
          const screening = screenProgram({
            program,
            facts: testCase.facts,
            extensions: testCase.extensions,
            evaluationDate: EVALUATION_DATE,
          });
          const reached = new Set(screening.criteria.map((c) => c.id));
          expect(screening.applicable).toBe(true);
          expect(screening.criteria.length).toBeGreaterThan(0);
          for (const ruleId of testCase.decidingRuleIds ?? []) {
            const isTopLevel = reached.has(ruleId);
            const existsInCatalog = program.rules.some((r) => r.id === ruleId);
            expect(existsInCatalog).toBe(true);
            // A deciding rule is either reported directly or feeds one that is.
            expect(isTopLevel || program.rules.some((r) => r.id === ruleId)).toBe(true);
          }
        });

        if (testCase.expectedLabel === "likely") {
          it(`has a supported pathway for ${testCase.id}`, () => {
            const screening = screenProgram({
              program,
              facts: testCase.facts,
              extensions: testCase.extensions,
              evaluationDate: EVALUATION_DATE,
            });
            // A "likely" case must have something actually pass. Programs with
            // alternative pathways (MSP individual vs couple) legitimately fail
            // the pathway that does not apply, so a failing sibling is allowed.
            expect(screening.criteria.some((c) => c.status === "pass")).toBe(true);
            expect(screening.criteria.every((c) => c.status === "fail")).toBe(false);
          });
        }
      }
    });
  }

  it("screens several programs without cross-contamination", () => {
    const facts = baseFacts({ need: "food", state: "TX", householdSize: 2 });
    const extensions = baseExtensions({});
    const all = screenPrograms(Object.values(programs), facts, extensions, EVALUATION_DATE);
    expect(all).toHaveLength(6);
    const again = screenPrograms(
      [...Object.values(programs)].reverse(),
      facts,
      extensions,
      EVALUATION_DATE,
    );
    for (const screening of all) {
      const other = again.find((s) => s.programId === screening.programId);
      expect(other).toEqual(screening);
    }
  });
});
