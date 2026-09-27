import { randomUUID } from "node:crypto";
import type { CallbackPayload } from "@/lib/n8n/callback";
import type { TriggerResult } from "@/lib/n8n/client";
import type { QuoteFormData } from "@/lib/quote-form";

// queued: saved, n8n not called yet · processing: n8n accepted (202), waiting for the callback ·
// ready: the PDF link arrived · failed: n8n rejected the request or reported a failure.
export type QuoteStatus = "queued" | "processing" | "ready" | "failed";

export type Quote = QuoteFormData & {
  id: string;
  status: QuoteStatus;
  // Created once with the record and sent in every retry to n8n.
  idempotencyKey: string;
  correlationId: string;
  jobId: string | null;
  documentUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

// The workflow takes 40–90 s. Past this the status page stops polling and says it is late.
const OVERDUE_AFTER_MS = 5 * 60 * 1000;

// Demo store on globalThis: Route Handlers and Server Actions are separate bundles, a
// module-level Map would give each its own copy. In production: a table with a unique
// idempotency_key.
const globalForQuotes = globalThis as unknown as { leadDeskQuotes?: Map<string, Quote> };
const quotes = (globalForQuotes.leadDeskQuotes ??= new Map<string, Quote>());

export async function insertQuote(input: QuoteFormData) {
  const now = new Date().toISOString();
  const quote: Quote = {
    ...input,
    // Unguessable: the status page is public and opened by this id alone.
    id: randomUUID(),
    status: "queued",
    idempotencyKey: randomUUID(),
    correlationId: randomUUID(),
    jobId: null,
    documentUrl: null,
    createdAt: now,
    updatedAt: now,
  };
  quotes.set(quote.id, quote);
  return structuredClone(quote);
}

export async function getQuote(id: string) {
  const quote = quotes.get(id);
  return quote ? structuredClone(quote) : null;
}

// The callback can arrive before this runs, so never move a quote back from a final status.
export async function markQuoteTriggered(id: string, result: TriggerResult) {
  const quote = quotes.get(id);
  if (!quote) return;
  if (result.ok && result.jobId && !quote.jobId) quote.jobId = result.jobId;
  if (quote.status === "queued") quote.status = result.ok ? "processing" : "failed";
  quote.updatedAt = new Date().toISOString();
}

export async function completeQuoteFromCallback(payload: CallbackPayload) {
  // Match by the request's idempotency key only if the quote has no jobId yet (the callback may
  // arrive before markQuoteTriggered) or the same one: never let the key and jobId point at two quotes.
  const byKey =
    payload.requestIdempotencyKey === null
      ? undefined
      : [...quotes.values()].find((q) => q.idempotencyKey === payload.requestIdempotencyKey);
  const quote = byKey
    ? byKey.jobId === null || byKey.jobId === payload.jobId
      ? byKey
      : undefined
    : [...quotes.values()].find((q) => q.jobId === payload.jobId);
  if (!quote) return false;
  quote.jobId = payload.jobId;
  quote.status = payload.status === "completed" ? "ready" : "failed";
  quote.documentUrl = payload.documentUrl;
  quote.updatedAt = new Date().toISOString();
  return true;
}

export function isQuoteOverdue(quote: Quote, now = Date.now()) {
  return (quote.status === "queued" || quote.status === "processing") && now - Date.parse(quote.createdAt) > OVERDUE_AFTER_MS;
}
