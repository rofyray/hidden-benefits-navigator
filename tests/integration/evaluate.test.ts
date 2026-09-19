/**
 * `/api/evaluate` service behaviour.
 *
 * Covers the authoritative-recompute guarantee, the provider fallback paths and
 * the request envelope. The route handler itself is deliberately thin, so the
 * service is exercised directly and the transport rules (body cap, limits,
 * safe errors) are exercised through the contract and limiter modules.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { baseExtensions, baseFacts, interval } from "../fixtures/builders";
import { CATALOG_VERSION } from "@/shared/catalog";
import { evaluateRequestSchema, evaluateResponseSchema, LIMITS } from "@/shared/contracts";
import { RULES_VERSION } from "@/shared/screening";
import { runEvaluation } from "@/server/evaluate";
import { acquire, LIMIT_SETTINGS, release, resetLimits } from "@/server/rate-limit";
import { signEvaluationToken, verifyEvaluationToken } from "@/server/token";
import { matchQuestionId, relevanceQuestionId } from "@/server/jev/policy";
import { PINNED_JEV_MODEL } from "@/server/jev/config";

const EVALUATION_DATE = "2026-09-19";
const NOW = 1_800_000_000;

const request = evaluateRequestSchema.parse({
  schemaVersion: "1",
  revision: 2,
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
  programIds: ["snap", "wic"],
});

function run() {
  return runEvaluation(request, { evaluationDate: EVALUATION_DATE, nowSeconds: NOW });
}

/** A provider reply that answers exactly the asked questions. */
function providerReply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function answersFor(questions: Record<string, unknown>, score: number, confidence: number) {
  const answers: Record<string, unknown> = {};
  for (const [id, question] of Object.entries(questions)) {
    const type = (question as { type: string }).type;
    if (type === "score") {
      const criteria = (question as { criteria: string[] }).criteria;
      const index = id.endsWith("_relevance") ? criteria.length - 1 : score;
      answers[id] = {
        type: "score",
        score: index,
        confidence,
        legend: Object.fromEntries(criteria.map((c, i) => [String(i), c])),
        probabilities: Object.fromEntries(criteria.map((_, i) => [String(i), i === index ? 1 : 0])),
      };
    } else {
      answers[id] = { type: "noul", noul: 0.9 };
    }
  }
  return answers;
}

describe("evaluate service", () => {
  beforeEach(() => {
    resetLimits();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a contract-valid response in rules mode when the provider is not configured", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const { response, fallbackCode } = await run();
    expect(fallbackCode).toBe("not_configured");
    expect(response.engine).toBe("rules");
    expect(response.model).toBeNull();
    expect(() => evaluateResponseSchema.parse(response)).not.toThrow();
  });

  it("echoes the request revision and the server's own versions", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const { response } = await run();
    expect(response.revision).toBe(2);
    expect(response.catalogVersion).toBe(CATALOG_VERSION);
    expect(response.rulesVersion).toBe(RULES_VERSION);
  });

  it("recomputes rules server-side and never echoes a client-supplied conclusion", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    // A tampered body carrying labels/criteria is rejected by the strict contract.
    const tampered = {
      ...request,
      results: [{ programId: "snap", label: "likely" }],
    };
    expect(evaluateRequestSchema.safeParse(tampered).success).toBe(false);

    const { response } = await run();
    const snap = response.results.find((r) => r.programId === "snap");
    expect(snap).toBeDefined();
    // Criteria carry the server's own catalog rule ids and statuses.
    expect(snap!.criteria.length).toBeGreaterThan(0);
    for (const criterion of snap!.criteria) {
      expect(criterion.id.startsWith("rule.")).toBe(true);
    }
  });

  it("uses the provider when configured and reports the pinned model", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    vi.stubEnv("JEV_MODEL", PINNED_JEV_MODEL);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as {
          model: string;
          questions: Record<string, unknown>;
        };
        expect(body.model).toBe(PINNED_JEV_MODEL);
        return providerReply({
          model: PINNED_JEV_MODEL,
          answers: answersFor(body.questions, 2, 0.9),
        });
      }),
    );

    const { response } = await run();
    expect(response.engine).toBe("jev");
    expect(response.model).toBe(PINNED_JEV_MODEL);
    expect(response.results.every((r) => r.matchScore !== null)).toBe(true);
    expect(() => evaluateResponseSchema.parse(response)).not.toThrow();
  });

  it("falls back to labeled rules mode when the provider answers with an unexpected shape", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    vi.stubEnv("JEV_MODEL", PINNED_JEV_MODEL);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerReply({ model: PINNED_JEV_MODEL, answers: { surprise: 1 } })),
    );
    const { response, fallbackCode } = await run();
    expect(response.engine).toBe("rules");
    expect(response.model).toBeNull();
    expect(fallbackCode).not.toBeNull();
    expect(response.results.length).toBe(2);
  });

  it("falls back without retrying when credentials are rejected", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "bad-key");
    vi.stubEnv("JEV_MODEL", PINNED_JEV_MODEL);
    const fetchMock = vi.fn(async () => new Response("no", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const { response, fallbackCode } = await run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.engine).toBe("rules");
    expect(fallbackCode).toBe("invalid_credentials");
  });

  it("asks one match and one relevance question per requested program", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    vi.stubEnv("JEV_MODEL", PINNED_JEV_MODEL);
    let asked: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { questions: Record<string, unknown> };
        asked = body.questions;
        return providerReply({ model: PINNED_JEV_MODEL, answers: answersFor(asked, 2, 0.9) });
      }),
    );
    await run();
    for (const id of ["snap", "wic"]) {
      expect(asked[matchQuestionId(id)]).toBeDefined();
      expect(asked[relevanceQuestionId(id)]).toBeDefined();
    }
  });

  it("ranks results and assigns a dense rank", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const { response } = await run();
    expect(response.results.map((r) => r.rank)).toEqual([0, 1]);
  });

  it("screens all six programs in one batch", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const all = evaluateRequestSchema.parse({
      ...request,
      programIds: ["snap", "wic", "eitc", "ceap", "medicare_help", "lifeline"],
    });
    const { response } = await runEvaluation(all, {
      evaluationDate: EVALUATION_DATE,
      nowSeconds: NOW,
    });
    expect(response.results.length).toBe(6);
    expect(new Set(response.results.map((r) => r.programId)).size).toBe(6);
    expect(() => evaluateResponseSchema.parse(response)).not.toThrow();
  });

  it("rejects unknown fields, bad program ids and a foreign schema version", () => {
    expect(evaluateRequestSchema.safeParse({ ...request, extra: 1 }).success).toBe(false);
    expect(evaluateRequestSchema.safeParse({ ...request, programIds: ["housing"] }).success).toBe(
      false,
    );
    expect(evaluateRequestSchema.safeParse({ ...request, schemaVersion: "2" }).success).toBe(false);
  });

  it("is deterministic for the same request in rules mode", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const a = await run();
    const b = await run();
    expect(JSON.stringify(a.response.results)).toBe(JSON.stringify(b.response.results));
  });
});

describe("evaluation token", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("EVALUATION_TOKEN_SECRET", "x".repeat(48));
  });

  it("round-trips and binds the catalog and rules versions", async () => {
    const token = await signEvaluationToken(
      {
        revision: 2,
        catalogVersion: CATALOG_VERSION,
        rulesVersion: RULES_VERSION,
        screening: { snap: ["rule.snap.state:pass"] },
      },
      NOW,
    );
    expect(token).not.toBeNull();
    const verified = await verifyEvaluationToken(token!, NOW + 10, {
      catalogVersion: CATALOG_VERSION,
      rulesVersion: RULES_VERSION,
      revision: 2,
    });
    expect(verified.ok).toBe(true);
  });

  it("rejects a tampered payload, an expired token and a version mismatch", async () => {
    const token = (await signEvaluationToken(
      {
        revision: 2,
        catalogVersion: CATALOG_VERSION,
        rulesVersion: RULES_VERSION,
        screening: {},
      },
      NOW,
    ))!;
    const [, body, signature] = token.split(".") as [string, string, string];
    const forged = `v1.${btoa('{"revision":99}').replace(/=+$/, "")}.${signature}`;
    expect(
      (
        await verifyEvaluationToken(forged, NOW, {
          catalogVersion: CATALOG_VERSION,
          rulesVersion: RULES_VERSION,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await verifyEvaluationToken(`v1.${body}.${signature}`, NOW + 3600, {
          catalogVersion: CATALOG_VERSION,
          rulesVersion: RULES_VERSION,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await verifyEvaluationToken(token, NOW, {
          catalogVersion: "0.0.1",
          rulesVersion: RULES_VERSION,
        })
      ).ok,
    ).toBe(false);
  });

  it("reports missing signing configuration instead of issuing an unsigned token", async () => {
    vi.stubEnv("EVALUATION_TOKEN_SECRET", "");
    expect(
      await signEvaluationToken(
        {
          revision: 1,
          catalogVersion: CATALOG_VERSION,
          rulesVersion: RULES_VERSION,
          screening: {},
        },
        NOW,
      ),
    ).toBeNull();
  });
});

describe("request limits", () => {
  beforeEach(() => resetLimits());

  it("caps requests per window and then recovers", () => {
    for (let i = 0; i < LIMIT_SETTINGS.MAX_REQUESTS_PER_WINDOW; i += 1) {
      expect(acquire("k", 1000).ok).toBe(true);
      release();
    }
    expect(acquire("k", 1000)).toEqual({ ok: false, reason: "rate_limited" });
    expect(acquire("k", 1000 + LIMIT_SETTINGS.WINDOW_MS + 1).ok).toBe(true);
  });

  it("caps concurrency", () => {
    for (let i = 0; i < LIMIT_SETTINGS.MAX_CONCURRENT; i += 1) {
      expect(acquire(`c${i}`, 1000).ok).toBe(true);
    }
    expect(acquire("c9", 1000)).toEqual({ ok: false, reason: "busy" });
    release();
    expect(acquire("c9", 1000).ok).toBe(true);
  });

  it("keeps the body cap small enough to reject an oversized submission", () => {
    expect(LIMITS.maxBodyBytes).toBe(32 * 1024);
  });
});
