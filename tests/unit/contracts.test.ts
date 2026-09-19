import { describe, expect, it } from "vitest";
import {
  evaluateRequestSchema,
  factsSchema,
  moneyIntervalSchema,
  programExtensionsSchema,
  verifyRequestSchema,
  LIMITS,
  MAX_CENTS,
} from "@/shared/contracts";
import { extractionJsonSchema } from "@/shared/extraction-schema";
import { baseExtensions, baseFacts, interval } from "../fixtures/builders";

describe("money intervals", () => {
  it("accepts a point interval and an open-ended interval", () => {
    expect(moneyIntervalSchema.parse({ minCents: 100_000, maxCents: 100_000 }).maxCents).toBe(
      100_000,
    );
    expect(moneyIntervalSchema.parse({ minCents: 0, maxCents: null }).maxCents).toBeNull();
  });

  it("rejects impossible values instead of clamping them", () => {
    expect(moneyIntervalSchema.safeParse({ minCents: -1, maxCents: 10 }).success).toBe(false);
    expect(moneyIntervalSchema.safeParse({ minCents: 10.5, maxCents: 20 }).success).toBe(false);
    expect(moneyIntervalSchema.safeParse({ minCents: 500, maxCents: 100 }).success).toBe(false);
    expect(moneyIntervalSchema.safeParse({ minCents: 0, maxCents: MAX_CENTS + 1 }).success).toBe(
      false,
    );
  });
});

describe("facts", () => {
  it("treats missing as null or unknown, never zero or false", () => {
    const facts = baseFacts();
    expect(facts.householdSize).toBeNull();
    expect(facts.income).toBeNull();
    expect(facts.medicarePartA).toBe("unknown");
  });

  it("rejects unknown keys", () => {
    expect(factsSchema.safeParse({ ...baseFacts(), ssn: "000-00-0000" }).success).toBe(false);
  });

  it("bounds household size and rejects out-of-range values", () => {
    expect(factsSchema.safeParse({ ...baseFacts(), householdSize: 0 }).success).toBe(false);
    expect(factsSchema.safeParse({ ...baseFacts(), householdSize: 21 }).success).toBe(false);
    expect(baseFacts({ householdSize: 20 }).householdSize).toBe(20);
  });

  it("requires an explicit period and basis with any income", () => {
    expect(
      factsSchema.safeParse({
        ...baseFacts(),
        income: { interval: interval(1000, 1500) },
      }).success,
    ).toBe(false);
    expect(
      baseFacts({ income: { interval: interval(1000, 1500), period: "monthly", basis: "gross" } })
        .income?.basis,
    ).toBe("gross");
  });
});

describe("program extensions", () => {
  it("keeps every program's fields separate and fully unknown by default", () => {
    const ext = baseExtensions();
    expect(ext.eitc.taxYear).toBeNull();
    expect(ext.medicare.extraHelpAnnualIncome).toBeNull();
    expect(ext.medicare.countableMonthly).toBeNull();
    expect(ext.wic.expectedInfants).toBeNull();
  });

  it("rejects an out-of-range qualifying-children count and expected infants", () => {
    expect(
      programExtensionsSchema.safeParse({
        ...baseExtensions(),
        eitc: { ...baseExtensions().eitc, qualifyingChildrenCount: 4 },
      }).success,
    ).toBe(false);
    expect(
      programExtensionsSchema.safeParse({
        ...baseExtensions(),
        wic: { ...baseExtensions().wic, expectedInfants: 11 },
      }).success,
    ).toBe(false);
  });
});

describe("route envelopes", () => {
  const validEvaluate = {
    schemaVersion: "1",
    revision: 1,
    catalogVersion: "0.1.0",
    facts: baseFacts({ state: "TX" }),
    extensions: baseExtensions(),
    programIds: ["snap"],
  };

  it("accepts a well-formed evaluate request", () => {
    expect(evaluateRequestSchema.safeParse(validEvaluate).success).toBe(true);
  });

  it("rejects a mismatched schema version and unknown properties", () => {
    expect(evaluateRequestSchema.safeParse({ ...validEvaluate, schemaVersion: "2" }).success).toBe(
      false,
    );
    expect(evaluateRequestSchema.safeParse({ ...validEvaluate, ip: "1.2.3.4" }).success).toBe(
      false,
    );
  });

  it("bounds verify drafts to the application limits", () => {
    const sentence = { id: "s1", text: "A sentence.", evidenceIds: ["ev.a"] };
    const base = {
      schemaVersion: "1",
      revision: 1,
      catalogVersion: "0.1.0",
      evaluationToken: "token",
      drafts: [{ programId: "snap", sentences: [sentence], checklist: [] }],
    };
    expect(verifyRequestSchema.safeParse(base).success).toBe(true);
    expect(
      verifyRequestSchema.safeParse({
        ...base,
        drafts: [
          {
            programId: "snap",
            sentences: Array.from({ length: LIMITS.maxSentencesPerProgram + 1 }, () => sentence),
            checklist: [],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      verifyRequestSchema.safeParse({
        ...base,
        drafts: [
          {
            programId: "snap",
            sentences: [{ ...sentence, text: "x".repeat(LIMITS.maxSentenceChars + 1) }],
            checklist: [],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      verifyRequestSchema.safeParse({
        ...base,
        drafts: [
          { programId: "snap", sentences: [{ ...sentence, evidenceIds: [] }], checklist: [] },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("extraction JSON Schema", () => {
  it("is generated from the contracts and admits no extra properties", () => {
    const facts = extractionJsonSchema["properties"] as Record<string, Record<string, unknown>>;
    expect(facts["facts"]?.["additionalProperties"]).toBe(false);
    expect(Object.keys(facts["facts"]?.["properties"] as object).sort()).toEqual(
      Object.keys(factsSchema.shape).sort(),
    );
    expect(Object.keys((facts["extensions"]?.["properties"] as object) ?? {}).sort()).toEqual(
      Object.keys(programExtensionsSchema.shape).sort(),
    );
  });

  it("expresses unknown as a nullable value rather than a default", () => {
    const factProps = (
      (extractionJsonSchema["properties"] as Record<string, Record<string, unknown>>)["facts"]?.[
        "properties"
      ] as Record<string, Record<string, unknown>>
    )["householdSize"];
    expect(JSON.stringify(factProps)).toContain('"null"');
  });
});
