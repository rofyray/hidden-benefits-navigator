import { createServerFn } from "@tanstack/react-start";

export type JevProbeResult = {
  configured: boolean;
  ok: boolean;
  /** Model name echoed by the provider, when it supplied one. */
  model: string | null;
  /** Safe outcome code; never a provider body, key or submitted content. */
  code: string;
  durationMs: number;
};

/**
 * One tiny synthetic Jev request, used only to record whether the configured
 * credential actually reaches the provider. Carries no personal content.
 */
export const probeJev = createServerFn({ method: "POST" }).handler(
  async (): Promise<JevProbeResult> => {
    const started = Date.now();
    const { systemOne, JevError, jevConfigured, PINNED_JEV_MODEL } =
      await import("@/server/jev/client");
    const { logEvent } = await import("@/server/logging");

    if (!jevConfigured()) {
      logEvent("warn", { route: "preflight.jev", outcome: "not_configured" });
      return {
        configured: false,
        ok: false,
        model: null,
        code: "not_configured",
        durationMs: Date.now() - started,
      };
    }

    try {
      const raw = (await systemOne(
        { probe: { statement: "The sky is blue." } },
        {
          probe_ok: {
            type: "noul",
            instructions: "Is `probe.statement` a statement about the weather or the sky?",
            criteria: { true: "It refers to the sky or weather.", false: "It does not." },
          },
        },
        { budgetMs: 8000 },
      )) as { model?: unknown } | null;

      const model =
        raw && typeof raw === "object" && typeof raw.model === "string" ? raw.model : null;
      const mismatch = model !== null && model !== PINNED_JEV_MODEL;
      const code = mismatch ? "model_mismatch" : "ok";
      logEvent("info", {
        route: "preflight.jev",
        outcome: code,
        modelVersion: model ?? "unreported",
        durationMs: Date.now() - started,
      });
      return { configured: true, ok: !mismatch, model, code, durationMs: Date.now() - started };
    } catch (error) {
      const code = error instanceof JevError ? error.code : "connection_error";
      logEvent("error", {
        route: "preflight.jev",
        outcome: code,
        durationMs: Date.now() - started,
      });
      return {
        configured: true,
        ok: false,
        model: null,
        code,
        durationMs: Date.now() - started,
      };
    }
  },
);
