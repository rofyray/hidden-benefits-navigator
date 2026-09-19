import { describe, expect, it, vi } from "vitest";
import { logEvent } from "@/server/logging";

describe("content-free logging", () => {
  it("drops fields outside the allowlist", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("info", {
      route: "/api/evaluate",
      outcome: "ok",
      // @ts-expect-error intentionally passing a forbidden field
      transcript: "I make 1200 a month and my name is Synthetic Person",
    });
    const line = spy.mock.calls[0]?.[0] as string;
    expect(line).toContain("/api/evaluate");
    expect(line).not.toContain("Synthetic Person");
    expect(line).not.toContain("transcript");
  });

  it("bounds string values so a payload cannot be logged whole", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logEvent("warn", { route: "x".repeat(500), outcome: "degraded" });
    const line = spy.mock.calls[0]?.[0] as string;
    expect(line.length).toBeLessThan(200);
  });
});
