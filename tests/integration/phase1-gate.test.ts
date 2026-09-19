/**
 * Phase 1 gate (P1-17).
 *
 * Three things are proven here, all with synthetic data:
 *
 * 1. Catalog completeness: six reviewed program entries, a manifest that pins
 *    each of them, no placeholder numeric limit and no mandatory paperwork
 *    without cited evidence.
 * 2. The two defects recorded by P1-16 stay fixed: exclusion-effect rules are
 *    reported the right way round (D1), and a single Medicare applicant is not
 *    failed against a couple's limits (D2).
 * 3. One evaluate -> verify round trip: the token minted by `/api/evaluate` is
 *    accepted by `/api/verify`, and a draft built only from catalog evidence is
 *    approved.
 *
 * No real transcript, personal fact, live token or secret appears in this file.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  allPrograms,
  allSources,
  CATALOG_VERSION,
  MANIFEST,
  programById,
  PROGRAM_ORDER,
} from "@/shared/catalog";
import { programSchema } from "@/shared/catalog-schema";
import {
  evaluateRequestSchema,
  evaluateResponseSchema,
  verifyRequestSchema,
  verifyResponseSchema,
} from "@/shared/contracts";
import { screenProgram } from "@/shared/screening";
import { runEvaluation } from "@/server/evaluate";
import { runVerification } from "@/server/verify";
import { resetLimits } from "@/server/rate-limit";
import { PINNED_JEV_MODEL } from "@/server/jev/config";
import { baseExtensions, baseFacts, interval } from "../fixtures/builders";

const EVALUATION_DATE = "2026-09-19";
const NOW = 1_800_000_000;
const SECRET = "phase-one-gate-test-secret-at-least-32-chars";

const PROGRAMS = allPrograms();
const ALL_PROGRAM_IDS = PROGRAMS.map((p) => p.id);

function providerReply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Answers exactly the asked questions: clean scores and zero claim risk. */
function stubProvider(): void {
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubEnv("JEV_MODEL", PINNED_JEV_MODEL);
  vi.stubEnv("EVALUATION_TOKEN_SECRET", SECRET);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { questions: Record<string, unknown> };
      const answers: Record<string, unknown> = {};
      for (const [id, question] of Object.entries(body.questions)) {
        const q = question as { type: string; criteria?: string[] };
        if (q.type === "score") {
          const criteria = q.criteria ?? [];
          const index = criteria.length - 1;
          answers[id] = {
            type: "score",
            score: index,
            confidence: 0.9,
            legend: Object.fromEntries(criteria.map((c, i) => [String(i), c])),
            probabilities: Object.fromEntries(
              criteria.map((_, i) => [String(i), i === index ? 1 : 0]),
            ),
          };
        } else {
          answers[id] = { type: "noul", noul: 0 };
        }
      }
      return providerReply({ model: PINNED_JEV_MODEL, answers });
    }),
  );
}

describe("catalog completeness gate", () => {
  beforeEach(() => {
    resetLimits();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("publishes exactly six reviewed entries, pinned by the manifest", () => {
    expect(PROGRAM_ORDER).toHaveLength(6);
    expect(PROGRAMS).toHaveLength(6);
    expect(MANIFEST.programs).toHaveLength(6);
    expect(MANIFEST.catalogVersion).toBe(CATALOG_VERSION);
    for (const entry of MANIFEST.programs) {
      const program = programById(entry.id);
      expect(program).toBeDefined();
      expect(program!.version).toBe(entry.version);
      expect(entry.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("parses every program file with its schema", () => {
    for (const id of PROGRAM_ORDER) {
      const raw = JSON.parse(readFileSync(`src/shared/catalog/programs/${id}.json`, "utf8"));
      expect(() => programSchema.parse(raw)).not.toThrow();
    }
  });

  it("carries no placeholder numeric limit", () => {
    for (const program of PROGRAMS) {
      for (const rule of program.rules) {
        if (rule.operator !== "lte" && rule.operator !== "gte") continue;
        const operands = rule.operands as {
          amountCents: number | null;
          householdScale: { bySize: Record<string, number> } | null;
        };
        if (operands.amountCents !== null) {
          expect(operands.amountCents).toBeGreaterThan(0);
        } else {
          const sizes = Object.values(operands.householdScale!.bySize);
          expect(sizes.length).toBeGreaterThan(0);
          for (const value of sizes) expect(value).toBeGreaterThan(0);
        }
      }
    }
  });

  it("cites evidence for every required document and every rule", () => {
    const sources = allSources();
    for (const program of PROGRAMS) {
      const evidenceIds = new Set(program.evidence.map((e) => e.id));
      for (const document of program.documents) {
        if (document.requiredness !== "required") continue;
        expect(document.evidenceIds.length).toBeGreaterThan(0);
        for (const id of document.evidenceIds) expect(evidenceIds.has(id)).toBe(true);
      }
      for (const rule of program.rules) {
        expect(rule.evidenceIds.length).toBeGreaterThan(0);
        for (const id of rule.evidenceIds) expect(evidenceIds.has(id)).toBe(true);
      }
      for (const evidence of program.evidence) {
        expect(evidence.sourceIds.length).toBeGreaterThan(0);
        for (const id of evidence.sourceIds) {
          expect(sources.some((s) => s.id === id)).toBe(true);
        }
      }
    }
  });
});

describe("D1 — exclusion-effect rules are reported the right way round", () => {
  const lifeline = programById("lifeline")!;
  const exclusionRules = lifeline.rules.filter((r) => r.effect === "exclusion");

  function screenLifeline(existingLifeline: "yes" | "no" | "unknown") {
    return screenProgram({
      program: lifeline,
      facts: baseFacts({ need: "phone", state: "TX", existingLifeline }),
      extensions: baseExtensions(),
      evaluationDate: EVALUATION_DATE,
    });
  }

  function criterion(existingLifeline: "yes" | "no" | "unknown", ruleId: string) {
    return screenLifeline(existingLifeline).criteria.find((c) => c.id === ruleId);
  }

  it("has at least one exclusion rule to check", () => {
    expect(exclusionRules.length).toBeGreaterThan(0);
  });

  it("excludes the household that already has the benefit", () => {
    for (const rule of exclusionRules) {
      expect(criterion("yes", rule.id)?.status).toBe("fail");
      expect(criterion("yes", rule.id)?.reasonCode).toBe("exclusion_applies");
    }
  });

  it("does not exclude the household that does not have it", () => {
    for (const rule of exclusionRules) {
      expect(criterion("no", rule.id)?.status).toBe("pass");
      expect(criterion("no", rule.id)?.reasonCode).toBe("exclusion_does_not_apply");
    }
  });

  it("keeps an unstated answer unknown rather than deciding it", () => {
    for (const rule of exclusionRules) {
      expect(criterion("unknown", rule.id)?.status).toBe("unknown");
    }
  });
});

describe("D2 — a single Medicare applicant is not judged against a couple's limits", () => {
  const medicare = programById("medicare_help")!;

  function screenMedicare(category: "individual" | "couple") {
    return screenProgram({
      program: medicare,
      facts: baseFacts({
        need: "medicare",
        state: "TX",
        ageBand: "65plus",
        medicarePartA: "yes",
      }),
      extensions: baseExtensions({
        medicare: {
          partBID: "yes",
          category,
          countableMonthly: interval(900, 900),
          countableResources: interval(4000, 4000),
          countableBasisConfirmed: "yes",
          extraHelpAnnualIncome: interval(10800, 10800),
          extraHelpResources: interval(4000, 4000),
          extraHelpBasisConfirmed: "yes",
        },
      }),
      evaluationDate: EVALUATION_DATE,
    });
  }

  it("reports no failing criterion for an individual under the individual limits", () => {
    const failing = screenMedicare("individual").criteria.filter((c) => c.status === "fail");
    expect(failing.map((c) => c.id)).toEqual([]);
  });

  it("reports no failing criterion for a couple under the couple limits", () => {
    const failing = screenMedicare("couple").criteria.filter((c) => c.status === "fail");
    expect(failing.map((c) => c.id)).toEqual([]);
  });

  it("combines each individual and couple pathway under one `any` rule", () => {
    const pairs = [
      "rule.medicare.msp_qmb",
      "rule.medicare.msp_slmb",
      "rule.medicare.msp_qi",
      "rule.medicare.extra_help_financial",
    ];
    for (const id of pairs) {
      const rule = medicare.rules.find((r) => r.id === id);
      expect(rule?.operator).toBe("any");
      const ruleIds = (rule!.operands as { ruleIds: string[] }).ruleIds;
      expect(ruleIds).toHaveLength(2);
      expect(ruleIds.some((r) => r.endsWith("_ind"))).toBe(true);
      expect(ruleIds.some((r) => r.endsWith("_couple"))).toBe(true);
    }
  });
});

describe("synthetic evaluate -> verify round trip", () => {
  beforeEach(() => {
    resetLimits();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("evaluates all six programs and verifies a draft built from catalog evidence", async () => {
    stubProvider();

    const evaluateRequest = evaluateRequestSchema.parse({
      schemaVersion: "1",
      revision: 1,
      catalogVersion: CATALOG_VERSION,
      facts: baseFacts({
        need: "food",
        state: "TX",
        householdSize: 3,
        foodHouseholdSize: 3,
        income: { interval: interval(1800, 1800), period: "monthly", basis: "gross" },
      }),
      extensions: baseExtensions({
        snap: { deductionsAssessed: "yes", countableNetMonthly: interval(1500, 1500) },
      }),
      programIds: ALL_PROGRAM_IDS,
    });

    const { response } = await runEvaluation(evaluateRequest, {
      evaluationDate: EVALUATION_DATE,
      nowSeconds: NOW,
    });

    expect(() => evaluateResponseSchema.parse(response)).not.toThrow();
    expect(response.engine).toBe("jev");
    expect(response.results.map((r) => r.programId).sort()).toEqual([...ALL_PROGRAM_IDS].sort());
    expect(response.evaluationToken).not.toBe("unsigned");

    const drafts = ALL_PROGRAM_IDS.map((programId) => {
      const program = programById(programId)!;
      const evidence = program.evidence.find((e) => e.text.length <= 200) ?? program.evidence[0]!;
      return {
        programId,
        sentences: [{ id: "s1", text: evidence.text, evidenceIds: [evidence.id] }],
        checklist: [],
      };
    });

    const verifyRequest = verifyRequestSchema.parse({
      schemaVersion: "1",
      revision: 1,
      catalogVersion: CATALOG_VERSION,
      evaluationToken: response.evaluationToken,
      drafts,
    });

    const verification = await runVerification(verifyRequest, { nowSeconds: NOW });
    expect(verification.ok).toBe(true);
    if (!verification.ok) return;
    expect(() => verifyResponseSchema.parse(verification.response)).not.toThrow();
    expect(verification.response.programs).toHaveLength(6);
    for (const program of verification.response.programs) {
      expect(program.status).toBe("approved");
      expect(program.approvedSentenceIds).toEqual(["s1"]);
      expect(program.reasonCodes).not.toContain("verify.token_unverifiable");
    }
  });
});
