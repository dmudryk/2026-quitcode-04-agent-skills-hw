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
// The order of the checks below is the team's n8n contract; do not reorder.
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
