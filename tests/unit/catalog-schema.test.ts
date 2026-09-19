import { describe, expect, it } from "vitest";
import {
  programSchema,
  ruleSchema,
  sourceSchema,
  validateCatalog,
  type Program,
} from "@/shared/catalog-schema";
import { synthProgram, synthSource, cents } from "../fixtures/builders";

const EVAL_DATE = "2026-09-19";
const opts = (sources = [synthSource()]) => ({ evaluationDate: EVAL_DATE, sources });

const rule = (over: Record<string, unknown> = {}) => ({
  id: "rule.a",
  fieldIds: ["income"],
  evidenceIds: ["ev.income"],
  operator: "lte",
  operands: {
    fieldId: "income",
    amountCents: cents(1000),
    householdScale: null,
    currency: "USD",
    period: "monthly",
    basis: "gross",
  },
  effect: "screening",
  exceptionRuleIds: [],
  blocksLikelyWhenUnknown: true,
  ...over,
});

describe("rule schema", () => {
  it("accepts each supported operator shape", () => {
    expect(ruleSchema.safeParse(rule()).success).toBe(true);
    expect(
      ruleSchema.safeParse(
        rule({ operator: "enumIn", operands: { fieldId: "state", values: ["TX"] } }),
      ).success,
    ).toBe(true);
    expect(
      ruleSchema.safeParse(rule({ operator: "all", operands: { ruleIds: ["rule.b"] } })).success,
    ).toBe(true);
    expect(
      ruleSchema.safeParse(rule({ operator: "referral", operands: { reasonCode: "ask_agency" } }))
        .success,
    ).toBe(true);
  });

  it("rejects an unsupported operator and an operand shape from another operator", () => {
    expect(ruleSchema.safeParse(rule({ operator: "regex" })).success).toBe(false);
    expect(
      ruleSchema.safeParse(rule({ operator: "all", operands: { fieldId: "income" } })).success,
    ).toBe(false);
  });

  it("rejects an unknown field id", () => {
    expect(ruleSchema.safeParse(rule({ fieldIds: ["bankBalance"] })).success).toBe(false);
  });

  it("rejects unsupported currency and mismatched period/tax-year combinations", () => {
    expect(
      ruleSchema.safeParse(rule({ operands: { ...rule().operands, currency: "EUR" } })).success,
    ).toBe(false);
    expect(
      ruleSchema.safeParse(rule({ operands: { ...rule().operands, period: "taxYear" } })).success,
    ).toBe(false);
    expect(
      ruleSchema.safeParse(rule({ operands: { ...rule().operands, taxYear: 2025 } })).success,
    ).toBe(false);
  });

  it("requires at least one evidence id", () => {
    expect(ruleSchema.safeParse(rule({ evidenceIds: [] })).success).toBe(false);
  });
});

describe("source schema", () => {
  it("rejects a non-HTTPS destination and a malformed date", () => {
    expect(sourceSchema.safeParse(synthSource({ url: "http://example.gov/x" })).success).toBe(
      false,
    );
    expect(sourceSchema.safeParse(synthSource({ retrievedOn: "19/09/2026" })).success).toBe(false);
    expect(sourceSchema.safeParse(synthSource({ retrievedOn: "2026-13-45" })).success).toBe(false);
  });
});

describe("program schema", () => {
  it("accepts the synthetic program and rejects a non-HTTPS application link", () => {
    expect(programSchema.safeParse(synthProgram()).success).toBe(true);
    const bad = synthProgram({
      application: [
        { id: "app.start", label: "Apply", url: "http://example.gov", evidenceIds: ["ev.income"] },
      ],
    });
    expect(programSchema.safeParse(bad).success).toBe(false);
  });
});

describe("validateCatalog", () => {
  const codes = (program: Program, sources = [synthSource()]) =>
    validateCatalog([program], opts(sources)).map((i) => i.code);

  it("passes a clean program", () => {
    expect(validateCatalog([synthProgram()], opts())).toEqual([]);
  });

  it("rejects dangling evidence, source and rule references", () => {
    expect(
      codes(
        synthProgram({
          rules: [{ ...rule({ evidenceIds: ["ev.missing"] }) } as Program["rules"][number]],
        }),
      ),
    ).toContain("dangling_evidence");
    expect(
      codes(
        synthProgram({
          evidence: [
            {
              id: "ev.income",
              text: "t",
              sourceIds: ["src.missing"],
              kind: "eligibility",
            },
          ],
        }),
      ),
    ).toContain("dangling_source");
    expect(
      codes(
        synthProgram({
          rules: [
            {
              ...rule({ operator: "all", operands: { ruleIds: ["rule.ghost"] } }),
            } as Program["rules"][number],
          ],
        }),
      ),
    ).toContain("dangling_rule");
  });

  it("detects a cycle in compound rules", () => {
    const program = synthProgram({
      rules: [
        { ...rule({ id: "rule.a", operator: "all", operands: { ruleIds: ["rule.b"] } }) },
        { ...rule({ id: "rule.b", operator: "all", operands: { ruleIds: ["rule.a"] } }) },
      ] as Program["rules"],
    });
    expect(codes(program)).toContain("cyclic_rule");
  });

  it("rejects duplicate versions of the same program", () => {
    const issues = validateCatalog([synthProgram(), synthProgram()], opts());
    expect(issues.map((i) => i.code)).toContain("duplicate_version");
  });

  it("rejects mixed tax years within one program", () => {
    const program = synthProgram({
      rules: [
        {
          ...rule({
            id: "rule.a",
            operands: { ...rule().operands, period: "taxYear", taxYear: 2024 },
          }),
        },
        {
          ...rule({
            id: "rule.b",
            operands: { ...rule().operands, period: "taxYear", taxYear: 2025 },
          }),
        },
      ] as Program["rules"],
    });
    expect(codes(program)).toContain("mixed_tax_years");
  });

  it("marks stale and unverified records unsupported rather than passing them", () => {
    expect(codes(synthProgram({ reviewDueOn: "2026-01-01" }))).toContain("review_overdue");
    expect(codes(synthProgram({ validTo: "2026-06-30" }))).toContain("expired_program");
    expect(codes(synthProgram({ status: "draft" }))).toContain("not_published");
    expect(codes(synthProgram(), [synthSource({ reviewStatus: "inaccessible" })])).toContain(
      "unverified_source",
    );
    expect(codes(synthProgram(), [synthSource({ effectiveTo: "2026-01-31" })])).toContain(
      "expired_source",
    );
  });

  it("rejects a fallback checklist item that does not exist", () => {
    expect(codes(synthProgram({ fallbackChecklistIds: ["doc.ghost"] }))).toContain(
      "dangling_checklist",
    );
  });
});
