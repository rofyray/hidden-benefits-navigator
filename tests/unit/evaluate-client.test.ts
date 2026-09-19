/**
 * Evaluation client and revision-safe orchestration.
 *
 * Synthetic requests and responses only; no network and no real catalog answer
 * is ever treated as ground truth here.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createEvaluationOrchestrator,
  evaluationReducer,
  initialEvaluationState,
  isRetryable,
  isRulesMode,
  postEvaluate,
  resultsAreCurrent,
  type EvaluateOutcome,
} from "@/client/evaluate";
import { emptyExtensions, emptyFacts } from "@/client/extraction/validate";
import { SCHEMA_VERSION, type EvaluateRequest, type EvaluateResponse } from "@/shared/contracts";

const PROGRAMS = ["snap", "wic", "medicare_help", "lifeline", "eitc", "ceap"] as const;

function request(revision = 3): EvaluateRequest {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision,
    catalogVersion: "1.1.0",
    facts: emptyFacts(),
    extensions: emptyExtensions(),
    programIds: [...PROGRAMS],
  };
}

function response(revision = 3, engine: "jev" | "rules" = "jev"): EvaluateResponse {
  return {
    revision,
    catalogVersion: "1.1.0",
    rulesVersion: "1.1.0",
    evaluationToken: "synthetic-token",
    model: engine === "jev" ? "synthetic-model" : null,
    engine,
    results: PROGRAMS.map((programId, index) => ({
      programId,
      label: "notAClearMatch" as const,
      criteria: [],
      reasonIds: [],
      missingFieldIds: [],
      matchScore: null,
      confidence: null,
      rank: index,
      valueEvidenceId: null,
    })),
    questionVersion: "1.0.0",
    policyVersion: "1.0.0",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("postEvaluate: sends one batched request", () => {
  it("posts every program id in a single call and returns the validated response", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as EvaluateRequest;
      expect(body.programIds).toHaveLength(6);
      expect(Object.keys(body).sort()).toEqual(
        ["catalogVersion", "extensions", "facts", "programIds", "revision", "schemaVersion"].sort(),
      );
      return jsonResponse(response());
    }) as unknown as typeof fetch;

    const outcome = await postEvaluate(request(), { fetchImpl });
    expect(outcome.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never carries a narrative or span: the body is exactly the contract keys", async () => {
    let sent = "";
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      sent = String(init?.body);
      return jsonResponse(response());
    }) as unknown as typeof fetch;
    await postEvaluate(request(), { fetchImpl });
    expect(sent).not.toContain("narrative");
    expect(sent).not.toContain("sourceSpans");
  });
});

describe("postEvaluate: error mapping", () => {
  const cases: Array<[number, string | undefined, string, boolean]> = [
    [400, "invalid_request", "invalid_request", false],
    [403, "forbidden_origin", "forbidden_origin", false],
    [409, "catalog_mismatch", "catalog_mismatch", false],
    [413, "payload_too_large", "payload_too_large", false],
    [429, "rate_limited", "rate_limited", true],
    [429, "busy", "busy", true],
    [503, "busy", "busy", true],
    [500, undefined, "server_error", true],
  ];

  for (const [status, declared, code, retryable] of cases) {
    it(`maps HTTP ${status} (${declared ?? "no code"}) to ${code}`, async () => {
      const fetchImpl = (async () =>
        jsonResponse(
          { error: declared, catalogVersion: "9.9.9" },
          status,
        )) as unknown as typeof fetch;
      const outcome = await postEvaluate(request(), { fetchImpl });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.code).toBe(code);
      expect(outcome.retryable).toBe(retryable);
    });
  }

  it("reports the server's catalog version on a mismatch so the client can reload", async () => {
    const fetchImpl = (async () =>
      jsonResponse(
        { error: "catalog_mismatch", catalogVersion: "2.0.0" },
        409,
      )) as unknown as typeof fetch;
    const outcome = await postEvaluate(request(), { fetchImpl });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.serverCatalogVersion).toBe("2.0.0");
  });

  it("treats a transport failure as a retryable network error", async () => {
    const fetchImpl = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const outcome = await postEvaluate(request(), { fetchImpl });
    expect(outcome).toMatchObject({ ok: false, code: "network_error", retryable: true });
  });

  it("refuses a body that does not match the response contract", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ revision: 3, results: "all good" })) as unknown as typeof fetch;
    const outcome = await postEvaluate(request(), { fetchImpl });
    expect(outcome).toMatchObject({ ok: false, code: "invalid_response" });
  });

  it("refuses a well-formed answer for a different revision", async () => {
    const fetchImpl = (async () => jsonResponse(response(2))) as unknown as typeof fetch;
    const outcome = await postEvaluate(request(3), { fetchImpl });
    expect(outcome).toMatchObject({ ok: false, code: "revision_mismatch" });
  });

  it("reports an abort as aborted, not as an error to show", async () => {
    const controller = new AbortController();
    const fetchImpl = (async () => {
      controller.abort();
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }) as unknown as typeof fetch;
    const outcome = await postEvaluate(request(), { fetchImpl, signal: controller.signal });
    expect(outcome).toMatchObject({ ok: false, code: "aborted", retryable: false });
  });

  it("accepts a rules-mode answer as a valid result", async () => {
    const fetchImpl = (async () => jsonResponse(response(3, "rules"))) as unknown as typeof fetch;
    const outcome = await postEvaluate(request(), { fetchImpl });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.response.engine).toBe("rules");
  });

  it("marks only rate limits, busy and server/network faults as retryable", () => {
    expect(isRetryable("rate_limited")).toBe(true);
    expect(isRetryable("busy")).toBe(true);
    expect(isRetryable("server_error")).toBe(true);
    expect(isRetryable("network_error")).toBe(true);
    expect(isRetryable("invalid_request")).toBe(false);
    expect(isRetryable("catalog_mismatch")).toBe(false);
    expect(isRetryable("aborted")).toBe(false);
  });
});

describe("evaluationReducer: stages", () => {
  it("shows a submitting stage tagged with the revision", () => {
    const state = evaluationReducer(initialEvaluationState(), { type: "submit", revision: 4 });
    expect(state.stage).toBe("submitting");
    expect(state.forRevision).toBe(4);
    expect(state.activeRequestId).toBe(1);
  });

  it("drops an answer whose request id is no longer active", () => {
    let state = evaluationReducer(initialEvaluationState(), { type: "submit", revision: 1 });
    state = evaluationReducer(state, { type: "submit", revision: 2 });
    state = evaluationReducer(state, {
      type: "resolved",
      requestId: 1,
      outcome: { ok: true, response: response(1) } satisfies EvaluateOutcome,
    });
    expect(state.stage).toBe("submitting");
    expect(state.response).toBeNull();
    expect(state.staleDropped).toBe(1);
  });

  it("clears results and the stage on invalidate", () => {
    let state = evaluationReducer(initialEvaluationState(), { type: "submit", revision: 1 });
    state = evaluationReducer(state, {
      type: "resolved",
      requestId: 1,
      outcome: { ok: true, response: response(1) },
    });
    expect(state.stage).toBe("ready");
    state = evaluationReducer(state, { type: "invalidate" });
    expect(state.stage).toBe("idle");
    expect(state.response).toBeNull();
    expect(state.forRevision).toBeNull();
  });

  it("returns to idle rather than failed when the request was aborted", () => {
    let state = evaluationReducer(initialEvaluationState(), { type: "submit", revision: 1 });
    state = evaluationReducer(state, {
      type: "resolved",
      requestId: 1,
      outcome: { ok: false, code: "aborted", retryable: false },
    });
    expect(state.stage).toBe("idle");
    expect(state.error).toBeNull();
  });

  it("keeps the failure and its retryability for display", () => {
    let state = evaluationReducer(initialEvaluationState(), { type: "submit", revision: 1 });
    state = evaluationReducer(state, {
      type: "resolved",
      requestId: 1,
      outcome: { ok: false, code: "busy", retryable: true },
    });
    expect(state.stage).toBe("failed");
    expect(state.error).toMatchObject({ code: "busy", retryable: true });
  });

  it("only calls results current for the revision they were computed for", () => {
    let state = evaluationReducer(initialEvaluationState(), { type: "submit", revision: 7 });
    state = evaluationReducer(state, {
      type: "resolved",
      requestId: 1,
      outcome: { ok: true, response: response(7) },
    });
    expect(resultsAreCurrent(state, 7)).toBe(true);
    expect(resultsAreCurrent(state, 8)).toBe(false);
  });

  it("recognises a rules-mode answer", () => {
    let state = evaluationReducer(initialEvaluationState(), { type: "submit", revision: 1 });
    state = evaluationReducer(state, {
      type: "resolved",
      requestId: 1,
      outcome: { ok: true, response: response(1, "rules") },
    });
    expect(isRulesMode(state)).toBe(true);
  });
});

describe("orchestrator: races, delays and resets", () => {
  const deferred = () => {
    let resolve!: (value: EvaluateOutcome) => void;
    const promise = new Promise<EvaluateOutcome>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  it("ignores a slow first answer once a newer revision was submitted", async () => {
    const first = deferred();
    const second = deferred();
    const calls: number[] = [];
    const orchestrator = createEvaluationOrchestrator({
      post: async (req) => {
        calls.push(req.revision);
        return calls.length === 1 ? first.promise : second.promise;
      },
    });

    const firstRun = orchestrator.submit(request(1));
    const secondRun = orchestrator.submit(request(2));
    second.resolve({ ok: true, response: response(2) });
    first.resolve({ ok: true, response: response(1) });
    await Promise.all([firstRun, secondRun]);

    const state = orchestrator.getState();
    expect(state.stage).toBe("ready");
    expect(state.response?.revision).toBe(2);
    expect(state.staleDropped).toBe(1);
  });

  it("aborts the request in flight when an edit invalidates it", async () => {
    const pending = deferred();
    let seen: AbortSignal | undefined;
    const orchestrator = createEvaluationOrchestrator({
      post: async (_req, opts) => {
        seen = opts.signal;
        return pending.promise;
      },
    });

    const run = orchestrator.submit(request(1));
    orchestrator.invalidate();
    expect(seen?.aborted).toBe(true);
    pending.resolve({ ok: false, code: "aborted", retryable: false });
    await run;
    expect(orchestrator.getState().stage).toBe("idle");
    expect(orchestrator.getState().response).toBeNull();
  });

  it("drops a late success that arrives after a reset", async () => {
    const pending = deferred();
    const orchestrator = createEvaluationOrchestrator({ post: async () => pending.promise });
    const run = orchestrator.submit(request(1));
    orchestrator.reset();
    pending.resolve({ ok: true, response: response(1) });
    await run;
    expect(orchestrator.getState().stage).toBe("idle");
    expect(orchestrator.getState().response).toBeNull();
  });

  it("notifies subscribers of each stage change", async () => {
    const stages: string[] = [];
    const orchestrator = createEvaluationOrchestrator({
      post: async () => ({ ok: true, response: response(1) }),
    });
    orchestrator.subscribe((state) => stages.push(state.stage));
    await orchestrator.submit(request(1));
    expect(stages).toEqual(["submitting", "ready"]);
  });

  it("surfaces a recoverable failure without clearing the person's ability to retry", async () => {
    const orchestrator = createEvaluationOrchestrator({
      post: async () => ({ ok: false, code: "server_error", retryable: true }),
    });
    await orchestrator.submit(request(1));
    expect(orchestrator.getState().error).toMatchObject({ code: "server_error", retryable: true });
    const orchestrator2 = createEvaluationOrchestrator({
      post: async () => ({ ok: true, response: response(1) }),
    });
    await orchestrator2.submit(request(1));
    expect(orchestrator2.getState().stage).toBe("ready");
  });
});
