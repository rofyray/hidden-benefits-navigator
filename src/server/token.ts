/**
 * Signed, expiring evaluation tokens.
 *
 * `/api/evaluate` returns one; `/api/verify` requires it. The token carries only
 * non-identifying binding data — revision, catalog and rules versions, the
 * screened program ids and their criterion statuses — so a later verification
 * checks the same authoritative screening the server computed, and a client
 * cannot substitute its own rule results.
 *
 * Signed with HMAC-SHA-256 through Web Crypto, which the edge runtime provides.
 */

const ENCODER = new TextEncoder();

/** Tokens are short-lived: they bind one drafting turn, not a session. */
export const TOKEN_TTL_SECONDS = 15 * 60;

export type TokenPayload = {
  readonly revision: number;
  readonly catalogVersion: string;
  readonly rulesVersion: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  /** Program id → ordered criterion statuses the server computed. */
  readonly screening: Record<string, string[]>;
};

export type TokenFailure = {
  readonly ok: false;
  readonly reason: "not_configured" | "malformed" | "bad_signature" | "expired" | "mismatch";
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Read at call time: the edge runtime injects environment per request, so a
 * module-scope read would be undefined.
 */
function signingSecret(): string | null {
  const secret = process.env["EVALUATION_TOKEN_SECRET"];
  return secret && secret.length >= 32 ? secret : null;
}

export function tokenSigningConfigured(): boolean {
  return signingSecret() !== null;
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, ENCODER.encode(message)));
}

/** Constant-time comparison so a signature cannot be probed byte by byte. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function signEvaluationToken(
  payload: Omit<TokenPayload, "issuedAt" | "expiresAt">,
  nowSeconds: number,
): Promise<string | null> {
  const secret = signingSecret();
  if (!secret) return null;
  const full: TokenPayload = {
    ...payload,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + TOKEN_TTL_SECONDS,
  };
  const body = base64UrlEncode(ENCODER.encode(JSON.stringify(full)));
  const signature = base64UrlEncode(await hmac(secret, body));
  return `v1.${body}.${signature}`;
}

export async function verifyEvaluationToken(
  token: string,
  nowSeconds: number,
  expected: { catalogVersion: string; rulesVersion: string; revision?: number },
): Promise<{ ok: true; payload: TokenPayload } | TokenFailure> {
  const secret = signingSecret();
  if (!secret) return { ok: false, reason: "not_configured" };

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
  const [, body, signature] = parts as [string, string, string];

  const expectedSignature = await hmac(secret, body);
  const provided = base64UrlDecode(signature);
  if (!provided || !equalBytes(provided, expectedSignature)) {
    return { ok: false, reason: "bad_signature" };
  }

  const decoded = base64UrlDecode(body);
  if (!decoded) return { ok: false, reason: "malformed" };
  let payload: TokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(decoded)) as TokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload.expiresAt !== "number" || typeof payload.revision !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (payload.expiresAt <= nowSeconds) return { ok: false, reason: "expired" };
  if (
    payload.catalogVersion !== expected.catalogVersion ||
    payload.rulesVersion !== expected.rulesVersion ||
    (expected.revision !== undefined && payload.revision !== expected.revision)
  ) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, payload };
}
