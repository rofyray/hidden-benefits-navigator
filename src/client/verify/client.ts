/**
 * Verification client adapter.
 *
 * The browser's only way to reach `POST /api/verify`. Every draft for every
 * program travels in one batched call, carrying the evaluation token exactly as
 * the server issued it — the client never inspects, rewrites or mints it.
 *
 * Nothing here approves anything. The server rebuilds the evidence from its own
 * catalog and answers which sentence and checklist IDs may be shown; a response
 * that does not match the contract, or that answers for another revision, is
 * refused rather than displayed.
 */

import { verifyResponseSchema, type VerifyRequest, type VerifyResponse } from "@/shared/contracts";

export const VERIFY_ENDPOINT = "/api/verify";

export type VerifyErrorCode =
  | "catalog_changed"
  | "reevaluate_required"
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

const RETRYABLE: ReadonlySet<VerifyErrorCode> = new Set([
  "rate_limited",
  "busy",
  "server_error",
  "network_error",
]);

export function isRetryable(code: VerifyErrorCode): boolean {
  return RETRYABLE.has(code);
}

export type VerifyOutcome =
  | { ok: true; response: VerifyResponse }
  | {
      ok: false;
      code: VerifyErrorCode;
      retryable: boolean;
      /** Present on `catalog_changed`: the version the server holds. */
      serverCatalogVersion?: string;
    };

function failure(code: VerifyErrorCode, serverCatalogVersion?: string): VerifyOutcome {
  return {
    ok: false,
    code,
    retryable: isRetryable(code),
    ...(serverCatalogVersion === undefined ? {} : { serverCatalogVersion }),
  };
}

function declaredError(body: unknown): string | null {
  return typeof body === "object" &&
    body !== null &&
    typeof (body as { error?: unknown }).error === "string"
    ? (body as { error: string }).error
    : null;
}

function codeForStatus(status: number, body: unknown): VerifyErrorCode {
  const declared = declaredError(body);
  switch (status) {
    case 400:
      return "invalid_request";
    case 403:
      return "forbidden_origin";
    case 409:
      return declared === "catalog_changed" ? "catalog_changed" : "reevaluate_required";
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

export type VerifyClientOptions = {
  signal?: AbortSignal;
  /** Injected in tests; defaults to the page's own `fetch`. */
  fetchImpl?: typeof fetch;
  endpoint?: string;
};

/** Post one batched verification covering every drafted program at once. */
export async function postVerify(
  request: VerifyRequest,
  options: VerifyClientOptions = {},
): Promise<VerifyOutcome> {
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") return failure("network_error");

  let res: Response;
  try {
    res = await doFetch(options.endpoint ?? VERIFY_ENDPOINT, {
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
    return failure(code, code === "catalog_changed" ? version : undefined);
  }

  const parsed = verifyResponseSchema.safeParse(body);
  if (!parsed.success) return failure("invalid_response");

  if (parsed.data.revision !== request.revision) return failure("revision_mismatch");

  return { ok: true, response: parsed.data };
}
