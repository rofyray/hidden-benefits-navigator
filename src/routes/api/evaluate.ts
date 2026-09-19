/**
 * `POST /api/evaluate` — thin transport around the authoritative evaluation.
 *
 * It validates the request against the strict allowlist contract, enforces the
 * body limit and the request limits, and returns a safe error code. Every
 * eligibility decision is recomputed here from the server's own catalog; a
 * client can supply facts, not conclusions. Errors never echo request content,
 * environment values or provider messages.
 */

import { createFileRoute } from "@tanstack/react-router";
import { CATALOG_VERSION } from "@/shared/catalog";
import { evaluateRequestSchema, LIMITS } from "@/shared/contracts";
import { runEvaluation } from "@/server/evaluate";
import { acquire, clientKey, release } from "@/server/rate-limit";
import { logEvent } from "@/server/logging";

function safeError(code: string, status: number, extra: Record<string, string> = {}): Response {
  return Response.json(
    { error: code, ...extra },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/evaluate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        // Same-origin only: this endpoint serves this app's own browser code.
        // A request with no Origin (server-to-server, curl) is allowed; a
        // cross-origin one is refused before any work is done.
        const origin = request.headers.get("origin");
        if (origin !== null && origin !== new URL(request.url).origin) {
          return safeError("forbidden_origin", 403);
        }

        const declared = Number(request.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > LIMITS.maxBodyBytes) {
          return safeError("payload_too_large", 413);
        }

        const limit = acquire(clientKey(request));
        if (!limit.ok) {
          logEvent("warn", { route: "evaluate", outcome: limit.reason, status: 429 });
          return safeError(limit.reason, limit.reason === "busy" ? 503 : 429);
        }

        try {
          const text = await request.text();
          if (text.length > LIMITS.maxBodyBytes) return safeError("payload_too_large", 413);

          let body: unknown;
          try {
            body = JSON.parse(text) as unknown;
          } catch {
            return safeError("invalid_request", 400);
          }

          const parsed = evaluateRequestSchema.safeParse(body);
          if (!parsed.success) {
            // Field paths only: never the submitted values.
            logEvent("warn", { route: "evaluate", outcome: "invalid_request", status: 400 });
            return safeError("invalid_request", 400);
          }

          if (parsed.data.catalogVersion !== CATALOG_VERSION) {
            return safeError("catalog_mismatch", 409, { catalogVersion: CATALOG_VERSION });
          }

          const outcome = await runEvaluation(parsed.data, {
            evaluationDate: process.env["EVALUATION_DATE"] ?? new Date().toISOString().slice(0, 10),
            nowSeconds: Math.floor(Date.now() / 1000),
            signal: request.signal,
          });

          logEvent("info", {
            route: "evaluate",
            outcome: outcome.fallbackCode ?? "ok",
            mode: outcome.response.engine,
            catalogVersion: outcome.response.catalogVersion,
            modelVersion: outcome.response.model ?? "none",
            count: outcome.response.results.length,
            durationMs: Date.now() - startedAt,
            status: 200,
          });

          return Response.json(outcome.response, {
            headers: { "cache-control": "no-store" },
          });
        } catch {
          logEvent("error", { route: "evaluate", outcome: "unhandled", status: 500 });
          return safeError("evaluation_failed", 500);
        } finally {
          release();
        }
      },
    },
  },
});
