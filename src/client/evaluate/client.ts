/**
 * Evaluation client adapter.
 *
 * The browser's only way to reach `POST /api/evaluate`. It sends the projected
 * allowlist request — built by `projectEvaluateRequest`, so no narrative or span
 * can travel with it — and returns a closed set of outcomes. Nothing here
 * decides eligibility: the server recomputes every decision from its own
 * catalog, and a response that does not match the response contract, or that
 * answers for a different revision, is refused rather than displayed.
 */

import {
  evaluateResponseSchema,
  type EvaluateRequest,
  type EvaluateResponse,
} from "@/shared/contracts";

export const EVALUATE_ENDPOINT = "/api/evaluate";

/** Every failure a caller has to be able to say something about. */
export type EvaluateErrorCode =
  | "catalog_mismatch"
  | "invalid_request"
  | "payload_too_large"
  | "rate_limited"
  | "busy"
  | "forbidden_origin"
  | "server_error"
  | "network_error"
  | "invalid_response"
  | "revision_mismatch"
  | "aborted";

/** Codes where trying the same request again can reasonably succeed. */
const RETRYABLE: ReadonlySet<EvaluateErrorCode> = new Set([
  "rate_limited",
  "busy",
  "server_error",
  "network_error",
]);

export function isRetryable(code: EvaluateErrorCode): boolean {
  return RETRYABLE.has(code);
}

export type EvaluateOutcome =
  | { ok: true; response: EvaluateResponse }
  | {
      ok: false;
      code: EvaluateErrorCode;
      retryable: boolean;
      /** Present on `catalog_mismatch`: the version the server holds. */
      serverCatalogVersion?: string;
    };

function failure(code: EvaluateErrorCode, serverCatalogVersion?: string): EvaluateOutcome {
  return {
    ok: false,
    code,
    retryable: isRetryable(code),
    ...(serverCatalogVersion === undefined ? {} : { serverCatalogVersion }),
  };
}

function codeForStatus(status: number, body: unknown): EvaluateErrorCode {
  const declared =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : null;

  switch (status) {
    case 400:
      return "invalid_request";
    case 403:
      return "forbidden_origin";
    case 409:
      return "catalog_mismatch";
    case 413:
      return "payload_too_large";
    case 429:
      return declared === "busy" ? "busy" : "rate_limited";
    case 503:
      return "busy";
    default:
      return status >= 500 ? "server_error" : "invalid_request";
  }
}

export type EvaluateClientOptions = {
  signal?: AbortSignal;
  /** Injected in tests; defaults to the page's own `fetch`. */
  fetchImpl?: typeof fetch;
  endpoint?: string;
};

/**
 * Post one evaluation. The request carries all the program IDs the caller asked
 * for in a single call — the six programs are always screened together, never
 * one request per program.
 */
export async function postEvaluate(
  request: EvaluateRequest,
  options: EvaluateClientOptions = {},
): Promise<EvaluateOutcome> {
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") return failure("network_error");

  let res: Response;
  try {
    res = await doFetch(options.endpoint ?? EVALUATE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(request),
      cache: "no-store",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (options.signal?.aborted || (error as { name?: string } | null)?.name === "AbortError") {
      return failure("aborted");
    }
    return failure("network_error");
  }

  if (options.signal?.aborted) return failure("aborted");

  let body: unknown = null;
  try {
    body = (await res.json()) as unknown;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const code = codeForStatus(res.status, body);
    const version =
      typeof body === "object" &&
      body !== null &&
      typeof (body as { catalogVersion?: unknown }).catalogVersion === "string"
        ? (body as { catalogVersion: string }).catalogVersion
        : undefined;
    return failure(code, code === "catalog_mismatch" ? version : undefined);
  }

  const parsed = evaluateResponseSchema.safeParse(body);
  if (!parsed.success) return failure("invalid_response");

  // A result that answers for other facts than the ones asked about is not a
  // result for this person's current answers.
  if (parsed.data.revision !== request.revision) return failure("revision_mismatch");

  return { ok: true, response: parsed.data };
}
