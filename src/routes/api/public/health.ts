import { createFileRoute } from "@tanstack/react-router";

/**
 * Liveness probe. Reports only non-secret version metadata: it must never
 * echo environment values, credential names' values, or request content.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(
          {
            status: "ok",
            service: "hidden-benefits-navigator",
            schemaVersion: "0.0.0",
            catalogVersion: "unconfigured",
            time: new Date().toISOString(),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
