/**
 * Server-only Jev transport adapter.
 *
 * Transport concerns only: pinned model, bounded retries, cancellation,
 * response-size cap and secret-safe diagnostics. Answer validation and display
 * policy live elsewhere. Never import this from client code — the filename
 * boundary keeps it out of the browser bundle, and nothing here is re-exported
 * from a shared module.
 *
 * Two rules matter most. A rejected credential or a malformed request is never
 * retried, so a bad key cannot turn into a burst of paid calls. And no upstream
 * response body is ever logged or forwarded: it may echo submitted content.
 */

import {
  DEFAULT_BUDGET_MS,
  JEV_ENDPOINT,
  MAX_ATTEMPTS,
  MAX_BACKOFF_MS,
  MAX_RESPONSE_BYTES,
  PINNED_JEV_MODEL,
  resolveJevConfig,
} from "./config";

export { PINNED_JEV_MODEL };
export { jevConfigured } from "./config";

export type Question =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> };

/**
 * Failure codes are a closed set. They name a condition, never a provider
 * message, so nothing from upstream can reach a log line or a screen.
 */
export type JevErrorCode =
  | "not_configured"
  | "unevaluated_model"
  | "invalid_credentials"
  | "invalid_request"
  | "temporarily_unavailable"
  | "connection_error"
  | "invalid_response"
  | "response_too_large"
  | "timed_out"
  | "aborted";

export class JevError extends Error {
  code: JevErrorCode;
  status?: number | undefined;
  constructor(code: JevErrorCode, status?: number) {
    super(code);
    this.name = "JevError";
    this.code = code;
    this.status = status;
  }
}

/**
 * What the caller should do about a failure. `configuration` failures are for
 * operators, `provider` failures mean rules mode with a visible fallback badge,
 * and `cancelled` means the person navigated away — show nothing at all.
 */
export type FallbackSignal = {
  readonly kind: "configuration" | "provider" | "cancelled";
  readonly code: JevErrorCode;
  /** Whether a later request in the same session is worth attempting. */
  readonly retryLater: boolean;
};

export function fallbackSignalFor(error: unknown): FallbackSignal {
  const code: JevErrorCode = error instanceof JevError ? error.code : "connection_error";
  switch (code) {
    case "not_configured":
    case "unevaluated_model":
    case "invalid_credentials":
    case "invalid_request":
      // An operator has to change something; repeating the call cannot help.
      return { kind: "configuration", code, retryLater: false };
    case "aborted":
      return { kind: "cancelled", code, retryLater: false };
    default:
      return { kind: "provider", code, retryLater: true };
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const retryable = (s: number) => s === 408 || s === 429 || s >= 500;

/** Maps a non-retryable status onto a closed failure code. */
function rejectionCode(status: number): JevErrorCode {
  if (status === 401 || status === 403) return "invalid_credentials";
  return "invalid_request";
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

async function readBounded(res: Response): Promise<unknown> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await res.body?.cancel();
    throw new JevError("response_too_large");
  }
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new JevError("response_too_large");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new JevError("invalid_response");
  }
}

export async function systemOne(
  state: unknown,
  questions: Record<string, Question>,
  options: { signal?: AbortSignal; budgetMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<unknown> {
  const config = resolveJevConfig();
  if (!config.ok) throw new JevError(config.reason);

  const doFetch = options.fetchImpl ?? fetch;
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  let last: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (options.signal?.aborted) throw new JevError("aborted");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new JevError("timed_out");

    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, remaining);
    let delay = Math.min(MAX_BACKOFF_MS, 250 * 2 ** attempt + Math.random() * 150);

    try {
      const res = await doFetch(JEV_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state, model: config.model, questions }),
      });
      if (res.ok) return await readBounded(res);
      // Never log or forward upstream bodies: they may echo submitted content.
      if (!retryable(res.status)) {
        await res.body?.cancel();
        throw new JevError(rejectionCode(res.status), res.status);
      }
      const retryMsHeader = res.headers.get("retry-after-ms");
      const retryMs = retryMsHeader === null ? null : Number(retryMsHeader);
      const serverDelay =
        retryMs !== null && Number.isFinite(retryMs)
          ? Math.max(0, retryMs)
          : retryAfterMs(res.headers.get("retry-after"));
      if (serverDelay !== null) delay = serverDelay;
      last = new JevError("temporarily_unavailable", res.status);
      await res.body?.cancel();
    } catch (error) {
      if (options.signal?.aborted) throw new JevError("aborted");
      if (error instanceof JevError) throw error;
      last = new JevError(controller.signal.aborted ? "timed_out" : "connection_error");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    }

    if (attempt === MAX_ATTEMPTS - 1) break;
    // Respect a provider's stated wait: never retry early to beat the budget.
    if (delay >= deadline - Date.now()) throw new JevError("timed_out");
    await wait(delay);
  }

  throw last ?? new JevError("temporarily_unavailable");
}
