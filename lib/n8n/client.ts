import "server-only";
import { createHash } from "node:crypto";

// The only place that calls n8n. One event = one webhook path.
export type N8nEvent = "quote-request" | "lead-created";

// A stable, UUID-shaped idempotency-key for one business operation on one record:
// the same record always gets the same key, so a repeated call is a repeat for n8n.
export function operationKey(event: N8nEvent, recordId: string) {
  const hex = createHash("sha256").update(`${event}:${recordId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000]; // at most 3 attempts in total

export type TriggerResult =
  | { ok: true; status: number; jobId: string | null }
  | { ok: false; status: number | null };

function requireEnv(name: "N8N_WEBHOOK_BASE_URL" | "N8N_WEBHOOK_TOKEN" | "APP_BASE_URL") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value.replace(/\/$/, "");
}

export function callbackUrlFor(event: N8nEvent) {
  return `${requireEnv("APP_BASE_URL")}/api/n8n/${event}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function triggerWorkflow(
  event: N8nEvent,
  data: Record<string, unknown>,
  options: { idempotencyKey: string; correlationId: string; withCallback: boolean },
): Promise<TriggerResult> {
  const baseUrl = requireEnv("N8N_WEBHOOK_BASE_URL");
  if (!baseUrl.endsWith("/webhook")) throw new Error("N8N_WEBHOOK_BASE_URL must end with /webhook");
  const token = requireEnv("N8N_WEBHOOK_TOKEN");

  const body = JSON.stringify({
    version: 1,
    event,
    data,
    ...(options.withCallback ? { callbackUrl: callbackUrlFor(event) } : {}),
  });
  const bodySha256 = createHash("sha256").update(body).digest("hex");

  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    const started = Date.now();
    let status: number | null = null;
    try {
      const response = await fetch(`${baseUrl}/${event}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-n8n-token": token,
          "idempotency-key": options.idempotencyKey,
          "x-correlation-id": options.correlationId,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      logAttempt(event, options.correlationId, attempt, status, started, body, bodySha256);

      if (response.ok) {
        // Only the status matters; for 202 the Respond to Webhook node sends {"job_id": "..."}.
        const json = status === 202 ? await response.json().catch(() => null) : null;
        return { ok: true, status, jobId: typeof json?.job_id === "string" ? json.job_id : null };
      }
      // 4xx is a configuration error (403 token, 404 unpublished or test URL): never retried.
      if (status < 500) return { ok: false, status };
    } catch (error) {
      // Network error or TimeoutError from AbortSignal.timeout: retried.
      logAttempt(event, options.correlationId, attempt, error instanceof Error ? error.name : "Error", started, body, bodySha256);
    }
    if (attempt <= RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    else return { ok: false, status };
  }
  return { ok: false, status: null };
}

// Never log the body, the token or personal data: event, correlation id, status, timing, size and hash only.
function logAttempt(event: string, correlationId: string, attempt: number, outcome: number | string, started: number, body: string, bodySha256: string) {
  console.info(
    `n8n -> ${event} attempt=${attempt} outcome=${outcome} ms=${Date.now() - started} ` +
      `correlation=${correlationId} bytes=${Buffer.byteLength(body)} sha256=${bodySha256}`,
  );
}
