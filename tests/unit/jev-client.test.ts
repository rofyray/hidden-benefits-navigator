import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JevError,
  PINNED_JEV_MODEL,
  fallbackSignalFor,
  jevConfigured,
  systemOne,
} from "@/server/jev/client";
import { JEV_ENDPOINT, MAX_RESPONSE_BYTES } from "@/server/jev/config";

const originalKey = process.env["TYPESAFE_API_KEY"];
const originalModel = process.env["JEV_MODEL"];

afterEach(() => {
  if (originalKey === undefined) delete process.env["TYPESAFE_API_KEY"];
  else process.env["TYPESAFE_API_KEY"] = originalKey;
  if (originalModel === undefined) delete process.env["JEV_MODEL"];
  else process.env["JEV_MODEL"] = originalModel;
});

const questions = { q: { type: "noul" as const, instructions: "x" } };

function configure() {
  process.env["TYPESAFE_API_KEY"] = "test-key";
  process.env["JEV_MODEL"] = PINNED_JEV_MODEL;
}

/** Builds a fetch stub that always answers with the same response factory. */
function stub(make: () => Response) {
  return vi.fn(async () => make()) as unknown as typeof fetch;
}

describe("jev transport configuration", () => {
  it("reports a missing credential instead of calling out", async () => {
    delete process.env["TYPESAFE_API_KEY"];
    expect(jevConfigured()).toBe(false);
    const fetchImpl = stub(() => new Response("{}", { status: 200 }));
    await expect(systemOne({}, questions, { fetchImpl })).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses an unpinned model", async () => {
    process.env["TYPESAFE_API_KEY"] = "test-key";
    process.env["JEV_MODEL"] = "jev-9.9.9";
    expect(jevConfigured()).toBe(false);
    await expect(systemOne({}, questions)).rejects.toMatchObject({ code: "unevaluated_model" });
  });

  it("sends the fixed endpoint, pinned model and server credential", async () => {
    configure();
    const seen: { url: string; init: RequestInit | undefined } = { url: "", init: undefined };
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      seen.url = url;
      seen.init = init;
      return new Response(JSON.stringify({ model: PINNED_JEV_MODEL, answers: {} }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const result = await systemOne({ a: 1 }, questions, { fetchImpl });

    expect(seen.url).toBe(JEV_ENDPOINT);
    const headers = seen.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key");
    const body = JSON.parse(String(seen.init?.body)) as {
      model: string;
      questions: Record<string, unknown>;
    };
    expect(body.model).toBe(PINNED_JEV_MODEL);
    expect(Object.keys(body.questions)).toEqual(["q"]);
    expect(result).toEqual({ model: PINNED_JEV_MODEL, answers: {} });
  });
});

describe("jev transport failure handling", () => {
  it("does not retry rejected credentials (401)", async () => {
    configure();
    const fetchImpl = stub(() => new Response("nope", { status: 401 }));
    await expect(systemOne({}, questions, { fetchImpl })).rejects.toMatchObject({
      code: "invalid_credentials",
      status: 401,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a forbidden credential (403)", async () => {
    configure();
    const fetchImpl = stub(() => new Response("nope", { status: 403 }));
    await expect(systemOne({}, questions, { fetchImpl })).rejects.toMatchObject({
      code: "invalid_credentials",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a malformed request (422)", async () => {
    configure();
    const fetchImpl = stub(() => new Response("bad", { status: 422 }));
    await expect(systemOne({}, questions, { fetchImpl })).rejects.toMatchObject({
      code: "invalid_request",
      status: 422,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a rate limit (429) a bounded number of times", async () => {
    configure();
    const fetchImpl = stub(
      () => new Response("slow down", { status: 429, headers: { "retry-after-ms": "1" } }),
    );
    await expect(systemOne({}, questions, { fetchImpl, budgetMs: 500 })).rejects.toMatchObject({
      code: "temporarily_unavailable",
      status: 429,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries an overloaded provider (529) and can succeed on a later attempt", async () => {
    configure();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3)
        return new Response("busy", { status: 529, headers: { "retry-after-ms": "1" } });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(systemOne({}, questions, { fetchImpl, budgetMs: 1000 })).resolves.toEqual({
      ok: true,
    });
    expect(calls).toBe(3);
  });

  it("gives up rather than retrying earlier than the provider asked", async () => {
    configure();
    const fetchImpl = stub(
      () => new Response("busy", { status: 503, headers: { "retry-after": "60" } }),
    );
    await expect(systemOne({}, questions, { fetchImpl, budgetMs: 200 })).rejects.toMatchObject({
      code: "timed_out",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats an unparseable body as a transport failure", async () => {
    configure();
    const fetchImpl = stub(() => new Response("not json", { status: 200 }));
    await expect(systemOne({}, questions, { fetchImpl })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("refuses an oversized declared body without buffering it", async () => {
    configure();
    const fetchImpl = stub(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) },
        }),
    );
    await expect(systemOne({}, questions, { fetchImpl })).rejects.toMatchObject({
      code: "response_too_large",
    });
  });

  it("refuses an oversized undeclared body", async () => {
    configure();
    const big = JSON.stringify({ pad: "x".repeat(MAX_RESPONSE_BYTES + 10) });
    const fetchImpl = stub(() => new Response(big, { status: 200 }));
    await expect(systemOne({}, questions, { fetchImpl })).rejects.toMatchObject({
      code: "response_too_large",
    });
  });

  it("reports a connection failure without leaking provider detail", async () => {
    configure();
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED 10.0.0.1:443 key=test-key");
    }) as unknown as typeof fetch;
    const error = await systemOne({}, questions, { fetchImpl, budgetMs: 1500 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(JevError);
    expect((error as JevError).code).toBe("connection_error");
    expect((error as JevError).message).not.toContain("test-key");
  });
});

describe("jev transport cancellation", () => {
  it("reports an abort before any request is made", async () => {
    configure();
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = stub(() => new Response("{}", { status: 200 }));
    await expect(
      systemOne({}, questions, { fetchImpl, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports an abort raised while a request is in flight", async () => {
    configure();
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
          setTimeout(() => controller.abort(), 5);
        }),
    ) as unknown as typeof fetch;
    await expect(
      systemOne({}, questions, { fetchImpl, signal: controller.signal, budgetMs: 1000 }),
    ).rejects.toMatchObject({ code: "aborted" });
  });

  it("times out when the provider never answers within the budget", async () => {
    configure();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    ) as unknown as typeof fetch;
    await expect(systemOne({}, questions, { fetchImpl, budgetMs: 40 })).rejects.toMatchObject({
      code: "timed_out",
    });
  });
});

describe("fallback signals", () => {
  it("routes configuration failures to operators and blocks a pointless retry", () => {
    for (const code of [
      "not_configured",
      "unevaluated_model",
      "invalid_credentials",
      "invalid_request",
    ] as const) {
      expect(fallbackSignalFor(new JevError(code))).toEqual({
        kind: "configuration",
        code,
        retryLater: false,
      });
    }
  });

  it("routes provider failures to rules mode with a later retry allowed", () => {
    for (const code of [
      "temporarily_unavailable",
      "connection_error",
      "invalid_response",
      "response_too_large",
      "timed_out",
    ] as const) {
      const signal = fallbackSignalFor(new JevError(code));
      expect(signal.kind).toBe("provider");
      expect(signal.retryLater).toBe(true);
    }
  });

  it("treats cancellation as neither a provider nor a configuration problem", () => {
    expect(fallbackSignalFor(new JevError("aborted")).kind).toBe("cancelled");
  });

  it("treats an unknown throwable as a connection failure", () => {
    expect(fallbackSignalFor(new TypeError("boom"))).toEqual({
      kind: "provider",
      code: "connection_error",
      retryLater: true,
    });
  });
});
