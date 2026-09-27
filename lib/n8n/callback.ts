import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_CALLBACK_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_S = 300;

// Signature: "sha256=" + hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`), checked on the RAW body.
export function verifyCallbackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  now = Date.now(),
): boolean {
  const secret = process.env.N8N_CALLBACK_SECRET;
  if (!secret || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > MAX_CLOCK_SKEW_S) return false;

  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`);
  const given = Buffer.from(signature);
  // timingSafeEqual throws on different lengths, so compare lengths first. Never ===.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Demo store: a process-local Set on globalThis (Route Handlers and Server Actions are
// separate bundles). In production this is a DB/KV row with a unique constraint.
const globalForKeys = globalThis as unknown as { n8nCallbackKeys?: Set<string> };
const claimedKeys = (globalForKeys.n8nCallbackKeys ??= new Set<string>());

export function claimIdempotencyKey(key: string): boolean {
  if (claimedKeys.has(key)) return false;
  claimedKeys.add(key);
  return true;
}

export function releaseIdempotencyKey(key: string) {
  claimedKeys.delete(key);
}

export type CallbackPayload = {
  event: string;
  jobId: string;
  status: "completed" | "failed";
  requestIdempotencyKey: string | null;
  documentUrl: string | null;
};

// The document link is rendered as <a href>: accept only http(s), never javascript: and friends.
function httpUrlOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Runs only AFTER the signature check. Returns null when the shape is wrong or the
// unsigned idempotency-key header does not match the signed body.
export function parseCallback(rawBody: string, pathEvent: string, idempotencyKey: string): CallbackPayload | null {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const { version, event, data } = body as { version?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (version !== 1 || typeof event !== "string" || typeof data !== "object" || data === null) return null;
  if (event !== `${pathEvent}.completed` && event !== `${pathEvent}.failed`) return null;

  const { jobId, status, requestIdempotencyKey, result } = data as {
    jobId?: unknown; status?: unknown; requestIdempotencyKey?: unknown; result?: { documentUrl?: unknown };
  };
  if (typeof jobId !== "string" || (status !== "completed" && status !== "failed")) return null;
  if (idempotencyKey !== `${jobId}:${event}`) return null;

  const documentUrl = status === "completed" ? httpUrlOrNull(result?.documentUrl) : null;
  if (status === "completed" && !documentUrl) return null;

  return {
    event,
    jobId,
    status,
    requestIdempotencyKey: typeof requestIdempotencyKey === "string" ? requestIdempotencyKey : null,
    documentUrl,
  };
}
