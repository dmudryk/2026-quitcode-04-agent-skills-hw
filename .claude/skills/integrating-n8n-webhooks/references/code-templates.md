# Шаблони коду (Next.js 16, перевірені з моком)

Ці файли зібрано й прогнано наскрізно з `scripts/mock-n8n.mjs --mode respond-202`: форма → 202 з
`auth=ok idempotency=new` → підписаний колбек → 202 → статус `ready`; `scripts/send-signed-callback.mjs`
на цьому роуті — 11/11. Адаптуйте імена (подія, сутність, сховище), але не порядок перевірок.

## `lib/n8n/client.ts` — єдиний модуль, що викликає n8n

`import "server-only"` у Next.js 16 працює без встановлення пакета.

```ts
import "server-only";
import { createHash } from "node:crypto";

// The only place that calls n8n. One event = one webhook path.
export type N8nEvent = "quote-request";

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
```

## `lib/n8n/callback.ts` — підпис, ідемпотентність, розбір колбека

```ts
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

// Demo store: a process-local Set. In production this is a DB/KV row with a unique constraint.
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
```

## `app/api/n8n/[event]/route.ts` — колбек

`RouteContext<"/api/n8n/[event]">` — глобальний тип Next.js 16 (`params` — Promise). Номери в коментарях — кроки
з `contract.md`, розділ 3.

```ts
import { after } from "next/server";
import {
  MAX_CALLBACK_BYTES,
  claimIdempotencyKey,
  parseCallback,
  releaseIdempotencyKey,
  verifyCallbackSignature,
} from "@/lib/n8n/callback";
import { completeQuoteFromCallback } from "@/lib/quotes";

// Public endpoint: n8n calls it when a workflow finishes. Trust only the signature.
const KNOWN_EVENTS = new Set(["quote-request"]);

export async function POST(request: Request, ctx: RouteContext<"/api/n8n/[event]">) {
  const { event } = await ctx.params;
  // 1. Before reading the body.
  if (!KNOWN_EVENTS.has(event)) return Response.json({ error: "not_found" }, { status: 404 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "unsupported_media_type" }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_CALLBACK_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }

  // 2-3. Raw text, read once. No request.json() and no JSON.parse before the signature check.
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_CALLBACK_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

  // 4-5. Timestamp window and HMAC (length check + timingSafeEqual inside).
  const signed = verifyCallbackSignature(raw, request.headers.get("x-n8n-timestamp"), request.headers.get("x-n8n-signature"));
  if (!signed) return Response.json({ error: "unauthorized" }, { status: 401 });

  // 6. Claim the idempotency key.
  const key = request.headers.get("idempotency-key");
  if (!key) return Response.json({ error: "bad_request" }, { status: 400 });
  if (!claimIdempotencyKey(key)) return Response.json({ duplicate: true }, { status: 200 });

  // 7. Parse and check the shape and that the key matches the signed body.
  const payload = parseCallback(raw, event, key);
  if (!payload) {
    releaseIdempotencyKey(key);
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // 8. Save the state BEFORE answering; release the key if saving fails so n8n's retry is not lost.
  try {
    const saved = await completeQuoteFromCallback(payload);
    if (!saved) {
      releaseIdempotencyKey(key);
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
  } catch (error) {
    releaseIdempotencyKey(key);
    console.error(`n8n <- ${event} save failed: ${error instanceof Error ? error.name : "Error"}`);
    return Response.json({ error: "internal" }, { status: 500 });
  }

  // 10. Slow follow-ups go after the response.
  after(() => console.info(`n8n <- ${payload.event} job=${payload.jobId} status=${payload.status} stored`));
  // 9.
  return Response.json({ ok: true }, { status: 202 });
}
```

## Server Action, що запускає воркфлоу

Користувач не чекає n8n: запис зі статусом `queued` → виклик у `after()` → редирект на сторінку статусу.
`idempotencyKey` і `correlationId` створюються **один раз** разом із записом і зберігаються в ньому.
Валідацію, доступні помилки й `useActionState` робіть за патерном форм команди; тут — лише частина про n8n.

```ts
"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { triggerWorkflow } from "@/lib/n8n/client";
import { insertQuote, markQuote } from "@/lib/quotes";

export type QuoteState = { status: "idle" } | { status: "invalid"; errors: Record<string, string> };

export async function requestQuote(_prev: QuoteState, formData: FormData): Promise<QuoteState> {
  // public form: no session by design
  const company = String(formData.get("company") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const description = String(formData.get("description") ?? "").trim().slice(0, 2000);
  const budget = Number(formData.get("budget")) || null;
  if (!company || !email.includes("@") || description.length < 10) return { status: "invalid", errors: { form: "invalid" } };

  const quote = await insertQuote({ company, email, description, budget });
  after(async () => {
    const result = await triggerWorkflow(
      "quote-request",
      { quoteId: quote.id, company, description, budget },
      { idempotencyKey: quote.idempotencyKey, correlationId: quote.correlationId, withCallback: true },
    );
    await markQuote(quote.id, result.ok ? { status: "processing", jobId: result.jobId } : { status: "failed" });
  });
  redirect(`/quotes/${quote.id}`);
}
```

- `data` для n8n — мінімум для воркфлоу (тут: id, компанія, опис, бюджет). Email/телефон — лише якщо воркфлоу
  справді їх використовує; не весь рядок з БД.
- `redirect()` після `after()` працює й без JavaScript. Альтернатива — повернути `{ status: "ok", id }`.
- Сторінка статусу (`/quotes/[id]`): Server Component читає запис і показує `queued` / `processing` / `ready`
  (з посиланням на документ) / `failed`. Без персональних даних на сторінці; id — `randomUUID()`, не
  послідовний номер. Поки статус не фінальний — кнопка/посилання «Оновити» або невеликий клієнтський
  компонент з `router.refresh()` кожні кілька секунд.

## Сховище (демо) — лише в `globalThis`

Route Handler і Server Action — різні бандли. Звичайна `const store = new Map()` у модулі дає **кожному свою
копію**: дія створить запис, а колбек його «не знайде» (перевірено: колбек отримав 400). У LeadDesk так само
зроблено `lib/db.ts`.

```ts
import { randomUUID } from "node:crypto";
import type { CallbackPayload } from "@/lib/n8n/callback";

export type QuoteStatus = "queued" | "processing" | "ready" | "failed";
export type Quote = {
  id: string; company: string; email: string; description: string; budget: number | null;
  status: QuoteStatus; idempotencyKey: string; correlationId: string; jobId: string | null;
  documentUrl: string | null; createdAt: string;
};

// Demo store on globalThis: Route Handlers and Server Actions are separate bundles, a module-level
// Map would give each its own copy.
const g = globalThis as unknown as { quoteStore?: Map<string, Quote> };
const quotes = (g.quoteStore ??= new Map<string, Quote>());

export async function insertQuote(input: Pick<Quote, "company" | "email" | "description" | "budget">) {
  const quote: Quote = {
    ...input, id: randomUUID(), status: "queued", idempotencyKey: randomUUID(), correlationId: randomUUID(),
    jobId: null, documentUrl: null, createdAt: new Date().toISOString(),
  };
  quotes.set(quote.id, quote);
  return quote;
}
export async function getQuote(id: string) { return quotes.get(id) ?? null; }
export async function markQuote(id: string, patch: Partial<Pick<Quote, "status" | "jobId">>) {
  const q = quotes.get(id); if (q) Object.assign(q, patch);
}
export async function completeQuoteFromCallback(p: CallbackPayload) {
  // By the request key only while the quote has no jobId yet or the same one; otherwise by jobId.
  const byKey = p.requestIdempotencyKey === null ? undefined : [...quotes.values()].find((x) => x.idempotencyKey === p.requestIdempotencyKey);
  const q = byKey ? (byKey.jobId === null || byKey.jobId === p.jobId ? byKey : undefined) : [...quotes.values()].find((x) => x.jobId === p.jobId);
  if (!q) return false;
  q.jobId = p.jobId; q.status = p.status === "completed" ? "ready" : "failed"; q.documentUrl = p.documentUrl;
  return true;
}
```

У production це таблиця з унікальним обмеженням на `idempotency_key`, а не пам'ять процесу.

## `.env.example`

```bash
# n8n (server-only; real values only in .env.local)
N8N_WEBHOOK_BASE_URL=http://127.0.0.1:5678/webhook
N8N_WEBHOOK_TOKEN=change-me-webhook-token
N8N_CALLBACK_SECRET=change-me-callback-secret
APP_BASE_URL=http://127.0.0.1:3000
```
