import { describe, expect, it } from "vitest";
import { Route } from "@/routes/api/public/health";

const handler = (
  Route.options as unknown as {
    server: { handlers: { GET: (ctx: unknown) => Promise<Response> } };
  }
).server.handlers.GET;

describe("GET /api/public/health", () => {
  it("reports ok with non-secret version metadata", async () => {
    const response = await handler({ request: new Request("http://localhost/api/public/health") });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as Record<string, unknown>;
    expect(body["status"]).toBe("ok");
    expect(body["service"]).toBe("hidden-benefits-navigator");
    expect(Object.keys(body).sort()).toEqual(
      ["catalogVersion", "schemaVersion", "service", "status", "time"].sort(),
    );
  });

  it("never exposes credential names or values", async () => {
    const response = await handler({ request: new Request("http://localhost/api/public/health") });
    const text = await response.text();
    for (const secretName of [
      "TYPESAFE_API_KEY",
      "EVALUATION_SIGNING_SECRET",
      "ANTHROPIC_API_KEY",
      "CLOUD_MODEL",
    ]) {
      expect(text).not.toContain(secretName);
    }
  });
});
