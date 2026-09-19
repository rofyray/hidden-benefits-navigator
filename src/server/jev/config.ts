/**
 * Server-only Jev configuration.
 *
 * Every value here comes from the server environment and is read at call time,
 * never at module scope, because the runtime injects environment per request.
 * No client request can influence any of it: the endpoint, the model and the
 * credential are fixed here, and the browser never sees or names them.
 */

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

/** The evaluated model. A different value is an unevaluated configuration. */
export const PINNED_JEV_MODEL = "jev-1.13.0";

/** Hard cap on the upstream response body we are willing to buffer. */
export const MAX_RESPONSE_BYTES = 512 * 1024;

/** Total wall-clock budget for one batch, including retries. */
export const DEFAULT_BUDGET_MS = 8_000;

/** Attempts per batch, including the first. Bounded so a failure cannot loop. */
export const MAX_ATTEMPTS = 3;

/** Longest backoff we will wait between attempts when the provider gives none. */
export const MAX_BACKOFF_MS = 2_000;

export type JevConfig =
  | { readonly ok: true; readonly apiKey: string; readonly model: string }
  | { readonly ok: false; readonly reason: "not_configured" | "unevaluated_model" };

/**
 * Resolves the server configuration. Returns a reason rather than throwing, so
 * callers can choose rules mode and an operator-visible configuration failure
 * instead of prompting anyone in the browser for a key.
 */
export function resolveJevConfig(): JevConfig {
  const apiKey = process.env["TYPESAFE_API_KEY"];
  if (!apiKey) return { ok: false, reason: "not_configured" };
  const model = process.env["JEV_MODEL"] ?? PINNED_JEV_MODEL;
  if (model !== PINNED_JEV_MODEL) return { ok: false, reason: "unevaluated_model" };
  return { ok: true, apiKey, model };
}

/** True when a batch can be attempted at all. Never exposes the credential. */
export function jevConfigured(): boolean {
  return resolveJevConfig().ok;
}
