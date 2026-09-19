/**
 * `POST /api/verify` — thin transport around the authoritative verification.
 *
 * It validates the request against the strict draft contract, enforces the body
 * limit and the request limits, and returns a safe error code. The evidence a
 * draft is checked against is rebuilt from the server's own catalog; a client
 * supplies wording and citation IDs, never evidence text or an approval.
 */

import { createFileRoute } from "@tanstack/react-router";
import { CATALOG_VERSION } from "@/shared/catalog";
import { LIMITS, verifyRequestSchema } from "@/shared/contracts";
import { runVerification } from "@/server/verify";
import { acquire, clientKey, release } from "@/server/rate-limit";
import { logEvent } from "@/server/logging";

function safeError(code: string, status: number, extra: Record<string, string> = {}): Response {
  return Response.json(
    { error: code, ...extra },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
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
          logEvent("warn", { route: "verify", outcome: limit.reason, status: 429 });
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

          const parsed = verifyRequestSchema.safeParse(body);
          if (!parsed.success) {
            // Field paths only: never the submitted drafts.
            logEvent("warn", { route: "verify", outcome: "invalid_request", status: 400 });
            return safeError("invalid_request", 400);
          }

          const outcome = await runVerification(parsed.data, {
            nowSeconds: Math.floor(Date.now() / 1000),
            signal: request.signal,
          });

          if (!outcome.ok) {
            logEvent("warn", { route: "verify", outcome: outcome.error, status: 409 });
            return safeError(
              outcome.error === "catalog_mismatch" ? "catalog_changed" : "reevaluate_required",
              409,
              { catalogVersion: CATALOG_VERSION },
            );
          }

          logEvent("info", {
            route: "verify",
            outcome: outcome.fallbackCode ?? "ok",
            mode: outcome.response.engine,
            catalogVersion: CATALOG_VERSION,
            modelVersion: outcome.response.model ?? "none",
            count: outcome.response.programs.filter((p) => p.status === "approved").length,
            durationMs: Date.now() - startedAt,
            status: 200,
          });

          return Response.json(outcome.response, {
            headers: { "cache-control": "no-store" },
          });
        } catch {
          logEvent("error", { route: "verify", outcome: "unhandled", status: 500 });
          return safeError("verification_failed", 500);
        } finally {
          release();
        }
      },
    },
  },
});
