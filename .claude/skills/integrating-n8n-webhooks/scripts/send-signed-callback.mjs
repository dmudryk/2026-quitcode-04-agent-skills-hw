#!/usr/bin/env node
// Sends a matrix of signed / tampered n8n callbacks to a callback Route Handler and checks the status codes.
// Node >= 20, no dependencies. Reads N8N_CALLBACK_SECRET from the environment; never prints it or any body.
import { createHmac, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const HELP = `send-signed-callback.mjs — callback matrix for the n8n contract

Usage:
  node --env-file=.env.local send-signed-callback.mjs --url <callback url> --job-id <jobId> [options]

Options:
  --url <url>        Callback endpoint, e.g. http://127.0.0.1:3000/api/n8n/quote-request (required)
  --job-id <id>      jobId of a REAL job the app is waiting for (see the mock log: "workflow <id> running").
                     Without it the "valid" case is skipped (an unknown job must not be accepted anyway).
  --request-key <k>  data.requestIdempotencyKey to put in the body (the idempotency-key the app sent to n8n).
  --event <name>     Callback event (default: "<last path segment>.completed").
  --only-invalid     Send only the cases that must be rejected.
  -h, --help         Show this help.

Environment:
  N8N_CALLBACK_SECRET  HMAC secret shared with n8n (required).

Cases and expected status:
  unknown-event 404 · wrong-content-type 415 · too-large 413 · no-signature 401 · bad-signature 401 ·
  stale-timestamp 401 · future-timestamp 401 · reformatted-body 401 · key-mismatch 400 ·
  valid 202 · duplicate 200 {"duplicate":true}
Exit code: 0 if every case matched, 1 otherwise, 2 on usage errors.`;

let args;
try {
  ({ values: args } = parseArgs({
    options: {
      url: { type: "string" }, "job-id": { type: "string" }, "request-key": { type: "string" },
      event: { type: "string" }, "only-invalid": { type: "boolean" }, help: { type: "boolean", short: "h" },
    },
  }));
} catch (error) {
  console.error(error.message); console.error(HELP); process.exit(2);
}
if (args.help) { console.log(HELP); process.exit(0); }
const secret = process.env.N8N_CALLBACK_SECRET;
if (!args.url || !/^https?:\/\//.test(args.url)) { console.error("--url <http(s) url> is required\n"); console.error(HELP); process.exit(2); }
if (!secret) { console.error("N8N_CALLBACK_SECRET is not set (run with node --env-file=.env.local …)"); process.exit(2); }

const url = new URL(args.url);
const pathEvent = url.pathname.split("/").filter(Boolean).pop();
const event = args.event ?? `${pathEvent}.completed`;
const now = () => Math.floor(Date.now() / 1000);
const sign = (ts, raw) => `sha256=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`;

function envelope(jobId, extra = {}) {
  return JSON.stringify({
    version: 1,
    event,
    data: {
      jobId, status: "completed", correlationId: randomUUID(),
      requestIdempotencyKey: args["request-key"] ?? null,
      result: { documentUrl: `https://files.example.test/n8n/${jobId}.pdf` },
      completedAt: new Date().toISOString(), ...extra,
    },
  });
}

function signedHeaders(raw, jobId, { ts = now(), key = `${jobId}:${event}`, signature } = {}) {
  return {
    "content-type": "application/json",
    "x-n8n-timestamp": String(ts),
    "x-n8n-signature": signature ?? sign(ts, raw),
    "idempotency-key": key,
    "x-correlation-id": randomUUID(),
  };
}

const fake = () => randomUUID(); // a job the app does not know: rejected cases must fail before that matters
const cases = [
  { name: "unknown-event", expect: 404, target: new URL(`../unknown-event-${Date.now()}`, url), build: () => { const j = fake(), raw = envelope(j); return { raw, headers: signedHeaders(raw, j) }; } },
  { name: "wrong-content-type", expect: 415, build: () => { const j = fake(), raw = envelope(j); return { raw, headers: { ...signedHeaders(raw, j), "content-type": "text/plain" } }; } },
  { name: "too-large", expect: 413, build: () => { const j = fake(), raw = envelope(j, { padding: "x".repeat(70 * 1024) }); return { raw, headers: signedHeaders(raw, j) }; } },
  { name: "no-signature", expect: 401, build: () => { const j = fake(), raw = envelope(j); const h = signedHeaders(raw, j); delete h["x-n8n-signature"]; return { raw, headers: h }; } },
  { name: "bad-signature", expect: 401, build: () => { const j = fake(), raw = envelope(j); return { raw, headers: signedHeaders(raw, j, { signature: `sha256=${"0".repeat(64)}` }) }; } },
  { name: "stale-timestamp", expect: 401, build: () => { const j = fake(), raw = envelope(j), ts = now() - 600; return { raw, headers: signedHeaders(raw, j, { ts }) }; } },
  { name: "future-timestamp", expect: 401, build: () => { const j = fake(), raw = envelope(j), ts = now() + 600; return { raw, headers: signedHeaders(raw, j, { ts }) }; } },
  { name: "reformatted-body", expect: 401, build: () => { const j = fake(), raw = envelope(j), h = signedHeaders(raw, j); return { raw: JSON.stringify(JSON.parse(raw), null, 2), headers: h }; } },
  { name: "key-mismatch", expect: 400, build: () => { const j = fake(), raw = envelope(j); return { raw, headers: signedHeaders(raw, j, { key: `${fake()}:${event}` }) }; } },
];
if (!args["only-invalid"] && args["job-id"]) {
  const jobId = args["job-id"];
  const raw = envelope(jobId);
  const headers = signedHeaders(raw, jobId);
  cases.push({ name: "valid", expect: 202, build: () => ({ raw, headers }) });
  cases.push({ name: "duplicate", expect: 200, duplicate: true, build: () => ({ raw, headers: { ...headers, "x-n8n-timestamp": headers["x-n8n-timestamp"] } }) });
} else if (!args["only-invalid"]) {
  console.log("note: no --job-id, skipping the valid/duplicate cases");
}

let failures = 0;
for (const c of cases) {
  const { raw, headers } = c.build();
  let status = "ERR";
  let duplicateFlag = null;
  try {
    const res = await fetch(c.target ?? url, { method: "POST", headers, body: raw, signal: AbortSignal.timeout(10_000) });
    status = res.status;
    if (c.duplicate) duplicateFlag = (await res.json().catch(() => ({}))).duplicate === true;
    else await res.arrayBuffer();
  } catch (error) {
    status = `ERR ${error.cause?.code ?? error.name}`;
  }
  const ok = status === c.expect && (!c.duplicate || duplicateFlag);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(18)} expected ${c.expect}${c.duplicate ? ' {"duplicate":true}' : ""}, got ${status}${c.duplicate && status === 200 && !duplicateFlag ? " without duplicate:true" : ""}`);
}
console.log(`\n${cases.length - failures}/${cases.length} cases as expected`);
process.exit(failures ? 1 : 0);
