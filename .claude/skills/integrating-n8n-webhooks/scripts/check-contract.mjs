#!/usr/bin/env node
// Static check of a Next.js project against the team's Next.js <-> n8n contract.
// Node >= 20, built-in modules only. Prints PASS/FAIL per check, file:line for every FAIL,
// exits 1 if anything fails. Never prints secret values: .env.example is the only env file read.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const HELP = `check-contract.mjs — static check of the Next.js <-> n8n contract

Usage:
  node check-contract.mjs [--root <dir>] [--changed-since <git-ref>]

Options:
  --root <dir>             Project to check (default: current directory).
  --changed-since <ref>    Only report problems in files changed since <ref> (plus untracked files);
                           in files that already existed, only on changed lines. Needs git in <dir>.
  -h, --help               Show this help.

Scanned: app/, src/, lib/, components/, pages/, root *.ts|*.js files, .env.example
(not node_modules, .next, .git, .claude, tools, docs, materials). Comments are ignored.
An n8n call is a fetch that mentions any N8N_* variable (directly or through a const holding it),
a /webhook/ or /webhook-test/ URL or port 5678. A callback route is a route.ts under a path with
n8n, *callback* or *webhook*, or one that reads x-n8n-* headers; the modules it imports are checked too.

Checks:
  C1  no-test-webhook-url     no /webhook-test/ URL in code or .env.example
  C2  no-public-n8n-env       no NEXT_PUBLIC_N8N_* anywhere
  C3  env-contract            .env.example: N8N_WEBHOOK_BASE_URL (…/webhook), N8N_WEBHOOK_TOKEN and
                              N8N_CALLBACK_SECRET = change-me-…, APP_BASE_URL; code reads only these N8N_* keys
  C4  single-client-module    n8n is called only from lib/n8n/client.*
  C5  server-only-client      lib/n8n/client.* exists and starts with import "server-only"
  C6  fetch-timeout           every fetch to n8n has signal: AbortSignal.timeout(...)
  C7  request-headers         n8n requests send x-n8n-token, idempotency-key, x-correlation-id
  C8  action-uses-after       Server Actions start n8n calls inside after(), not awaited by the user
  C9  callback-raw-body       callback route reads request.text(), never request.json()
  C10 verify-before-parse     callback route verifies the signature before JSON.parse/parse…()
  C11 signature-compare       HMAC compared with timingSafeEqual, never === / !==
  C12 timestamp-window        callback checks x-n8n-timestamp within 300 s
  C13 callback-idempotency    callback route reads the idempotency-key header
  C14 no-edge-runtime         no export const runtime = "edge"
  C15 no-sensitive-logs       n8n code does not log bodies, personal data, tokens or signatures

Exit code: 0 = no FAIL, 1 = at least one FAIL, 2 = usage error.
Checks are heuristics over source text: a FAIL points at a line to look at, a PASS is not a proof.`;

// ---------------------------------------------------------------- args
let args;
try {
  ({ values: args } = parseArgs({
    options: { root: { type: "string" }, "changed-since": { type: "string" }, help: { type: "boolean", short: "h" } },
  }));
} catch (error) {
  console.error(`${error.message}\n\n${HELP}`);
  process.exit(2);
}
if (args.help) {
  console.log(HELP);
  process.exit(0);
}
const root = resolve(args.root ?? process.cwd());
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`--root: not a directory: ${root}`);
  process.exit(2);
}

// ---------------------------------------------------------------- files
const SOURCE_DIRS = ["app", "src", "lib", "components", "pages"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude", "tools", "docs", "materials", "out", "build"]);
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIRS.has(entry.name)) return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return CODE_EXT.test(entry.name) ? [full] : [];
  });
}

const rel = (full) => relative(root, full).split(sep).join("/");
const codeFiles = [
  ...SOURCE_DIRS.flatMap((d) => walk(join(root, d))),
  ...readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isFile() && CODE_EXT.test(e.name))
    .map((e) => join(root, e.name)),
].map((full) => {
  const text = readFileSync(full, "utf8").replace(/\r\n?/g, "\n");
  return { path: rel(full), text, lines: text.split("\n"), code: stripComments(text).split("\n") };
});

const envPath = join(root, ".env.example");
const envFile = existsSync(envPath)
  ? { path: ".env.example", lines: readFileSync(envPath, "utf8").replace(/\r\n?/g, "\n").split("\n") }
  : null;

// Replace comments with spaces, keeping line breaks and string contents.
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null; // ' " `
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") { out += n ?? ""; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2; out += "  ";
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      i += 2; out += "  ";
      continue;
    }
    if (c === "'" || c === '"' || c === "`") quote = c;
    out += c;
    i++;
  }
  return out;
}

// Text of a call starting at line index `start` until its parentheses balance (max 40 lines).
function callText(file, start) {
  let depth = 0;
  let seen = false;
  let text = "";
  for (let i = start; i < Math.min(file.code.length, start + 40); i++) {
    for (const ch of file.code[i]) {
      if (ch === "(") { depth++; seen = true; }
      if (ch === ")") depth--;
    }
    text += file.code[i] + "\n";
    if (seen && depth <= 0) break;
  }
  return text;
}

const findLines = (file, re) => file.code.flatMap((line, i) => (re.test(line) ? [i + 1] : []));

// ---------------------------------------------------------------- classify
// An n8n reference: any N8N_* env var, a /webhook/ or /webhook-test/ URL, or the n8n port.
const N8N_REF = /process\.env\.N8N_\w+|\bN8N_\w+|["'`][^"'`]*\/webhook(-test)?\/|:5678\b/;
const isClientModule = (f) => /^(src\/)?lib\/n8n\/client\.(ts|js|mjs)$/.test(f.path);
const clientModule = codeFiles.find(isClientModule) ?? null;
const byPath = new Map(codeFiles.map((f) => [f.path, f]));

// Identifiers that hold an n8n URL: `const url = process.env.N8N_…` (also `?? "…/webhook/…"`).
const n8nIdentifiers = (f) =>
  [...f.code.join("\n").matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*([^;\n]*)/g)].filter(([, , init]) => N8N_REF.test(init)).map(([, name]) => name);

// fetch calls that go to n8n: the call (or the 3 lines before it) mention an n8n URL/env var or an
// identifier holding one, or the fetch lives in the client module.
const n8nFetches = codeFiles.flatMap((f) => {
  const ids = n8nIdentifiers(f);
  const idRe = ids.length ? new RegExp(`\\b(${ids.join("|")})\\b`) : null;
  return f.code.flatMap((line, i) => {
    if (!/\bfetch\s*\(/.test(line)) return [];
    const call = callText(f, i);
    const context = f.code.slice(Math.max(0, i - 3), i).join("\n") + "\n" + call;
    return isClientModule(f) || N8N_REF.test(context) || idRe?.test(call) ? [{ file: f, line: i + 1, call }] : [];
  });
});

// Resolve "@/x", "./x", "../x" imports to scanned files.
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = [...from.path.split("/").slice(0, -1), ...spec.split("/")].reduce((acc, part) => (part === ".." ? acc.slice(0, -1) : part === "." ? acc : [...acc, part]), []).join("/");
  else return null;
  for (const ext of ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"]) if (byPath.has(base + ext)) return byPath.get(base + ext);
  if (spec.startsWith("@/") && byPath.has(`src/${base}.ts`)) return byPath.get(`src/${base}.ts`);
  return null;
}
const importsOf = (f) =>
  [...f.code.join("\n").matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)].map(([, names, spec]) => ({
    names: names.split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)).filter((p) => p[0]).map((p) => ({ imported: p[0], local: p[1] ?? p[0] })),
    file: resolveImport(f, spec),
  }));

// Exported functions whose body contains an n8n fetch: calling them means calling n8n.
const n8nFunctions = new Map(); // file -> Set(name)
for (const x of n8nFetches) {
  const decls = x.file.code.flatMap((l, i) => [...l.matchAll(/export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)\s*=/g)].map((m) => ({ name: m[1] ?? m[2], line: i + 1 })));
  const owner = decls.filter((d) => d.line <= x.line).pop();
  if (owner) (n8nFunctions.get(x.file) ?? n8nFunctions.set(x.file, new Set()).get(x.file)).add(owner.name);
}
const n8nCallNames = (f) => importsOf(f).flatMap(({ names, file }) => (file && n8nFunctions.has(file) ? names.filter((n) => n8nFunctions.get(file).has(n.imported)).map((n) => n.local) : []));
const isServerActionFile = (f) => /^\s*["']use server["']/m.test(f.code.slice(0, 5).join("\n"));

// Callback routes: Route Handlers under a path with n8n/callback/webhook, or that read x-n8n-* headers.
const callbackFiles = codeFiles.filter((f) => /x-n8n-(signature|timestamp)/i.test(f.code.join("\n")));
const callbackRoutes = codeFiles.filter(
  (f) => /(^|\/)route\.(ts|js)$/.test(f.path) && (/\/(n8n|[^/]*callback[^/]*|[^/]*webhook[^/]*)\//i.test(f.path) || /x-n8n-/i.test(f.code.join("\n"))),
);
// Code a callback route relies on: its own text plus the modules it imports, plus lib/n8n/*.
const helperText = (r) =>
  [r, ...importsOf(r).map((i) => i.file).filter(Boolean), ...codeFiles.filter((f) => /^(src\/)?lib\/n8n\//.test(f.path))]
    .map((f) => f.code.join("\n"))
    .join("\n");

const usesN8n = n8nFetches.length > 0 || callbackRoutes.length > 0 || codeFiles.some((f) => /process\.env\.N8N_/.test(f.code.join("\n")));

// ---------------------------------------------------------------- checks
const results = [];
function check(id, name, fn) {
  const findings = [];
  let note = "";
  fn((path, line, message) => findings.push({ path, line, message }), (n) => (note = n));
  results.push({ id, name, findings, note });
}

check("C1", "no-test-webhook-url", (fail) => {
  for (const f of codeFiles) for (const l of findLines(f, /https?:\/\/[^\s"'`]*\/webhook-test\b|["'`]\/webhook-test\//)) fail(f.path, l, "test webhook URL (/webhook-test/) in code");
  envFile?.lines.forEach((line, i) => { if (/^[^#]*\/webhook-test/.test(line)) fail(envFile.path, i + 1, "test webhook URL (/webhook-test/) in .env.example"); });
});

check("C2", "no-public-n8n-env", (fail) => {
  for (const f of codeFiles) for (const l of findLines(f, /NEXT_PUBLIC_N8N/)) fail(f.path, l, "N8N_* variable with NEXT_PUBLIC_ prefix reaches the client bundle");
  envFile?.lines.forEach((line, i) => { if (/^\s*NEXT_PUBLIC_N8N/.test(line)) fail(envFile.path, i + 1, "NEXT_PUBLIC_N8N_* in .env.example"); });
});

const CONTRACT_KEYS = ["N8N_WEBHOOK_BASE_URL", "N8N_WEBHOOK_TOKEN", "N8N_CALLBACK_SECRET", "APP_BASE_URL"];
check("C3", "env-contract", (fail, note) => {
  if (!usesN8n && !envFile?.lines.some((l) => /^\s*N8N_/.test(l))) return note("no n8n usage found");
  if (!envFile) return fail(".env.example", 0, "missing .env.example with the contract keys");
  const entries = new Map();
  envFile.lines.forEach((line, i) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) entries.set(m[1], { value: m[2].trim().replace(/^["']|["']$/g, ""), line: i + 1 });
  });
  for (const key of CONTRACT_KEYS) if (!entries.has(key)) fail(".env.example", 1, `missing ${key}`);
  const base = entries.get("N8N_WEBHOOK_BASE_URL");
  if (base && !/\/webhook\/?$/.test(base.value)) fail(".env.example", base.line, "N8N_WEBHOOK_BASE_URL must end with /webhook");
  for (const key of ["N8N_WEBHOOK_TOKEN", "N8N_CALLBACK_SECRET"]) {
    const e = entries.get(key);
    if (e && !/^change-me/.test(e.value)) fail(".env.example", e.line, `${key} must be a change-me-… placeholder`);
  }
  for (const [key, e] of entries) if (/^N8N_/.test(key) && !CONTRACT_KEYS.includes(key)) fail(".env.example", e.line, `${key} is not a contract key`);
  for (const f of codeFiles)
    f.code.forEach((line, i) => {
      for (const [, key] of line.matchAll(/process\.env\.(N8N_\w+)/g)) if (!CONTRACT_KEYS.includes(key)) fail(f.path, i + 1, `reads ${key}, not a contract key`);
    });
});

check("C4", "single-client-module", (fail, note) => {
  if (!usesN8n) return note("no n8n usage found");
  for (const x of n8nFetches) if (!isClientModule(x.file)) fail(x.file.path, x.line, "fetch to n8n outside lib/n8n/client.ts");
  for (const f of codeFiles) {
    if (isClientModule(f)) continue;
    for (const l of findLines(f, /process\.env\.(N8N_WEBHOOK_BASE_URL|N8N_WEBHOOK_TOKEN)\b/)) fail(f.path, l, "webhook URL/token read outside lib/n8n/client.ts");
  }
});

check("C5", "server-only-client", (fail, note) => {
  if (!usesN8n) return note("no n8n usage found");
  if (!clientModule) {
    const firstPerFile = [...new Map(n8nFetches.map((x) => [x.file.path, x])).values()];
    if (!firstPerFile.length) return fail("lib/n8n/client.ts", 0, "no lib/n8n/client.ts module for n8n calls");
    for (const at of firstPerFile) fail(at.file.path, at.line, "no lib/n8n/client.ts module for n8n calls");
    return;
  }
  const first = clientModule.code.map((l, i) => [l.trim(), i + 1]).find(([l]) => l.length > 0);
  if (!first || !/^import\s+["']server-only["'];?$/.test(first[0])) fail(clientModule.path, first ? first[1] : 1, 'first statement must be import "server-only"');
});

check("C6", "fetch-timeout", (fail, note) => {
  if (!n8nFetches.length) return note("no fetch to n8n found");
  for (const x of n8nFetches) if (!/signal\s*:\s*AbortSignal\.timeout\s*\(/.test(x.call)) fail(x.file.path, x.line, "fetch to n8n without signal: AbortSignal.timeout(...)");
});

check("C7", "request-headers", (fail, note) => {
  if (!n8nFetches.length) return note("no fetch to n8n found");
  for (const x of n8nFetches) {
    const scope = x.file.code.join("\n");
    const missing = ["x-n8n-token", "idempotency-key", "x-correlation-id"].filter((h) => !new RegExp(`["'\`]${h}["'\`]`, "i").test(scope));
    if (missing.length) fail(x.file.path, x.line, `request without header(s): ${missing.join(", ")}`);
  }
});

check("C8", "action-uses-after", (fail, note) => {
  let seen = 0;
  for (const f of codeFiles.filter(isServerActionFile)) {
    const names = n8nCallNames(f);
    const callRe = names.length ? new RegExp(`\\b(${names.join("|")})\\s*\\(`) : null;
    const calls = [
      ...n8nFetches.filter((x) => x.file === f).map((x) => x.line),
      ...(callRe ? findLines(f, callRe).filter((l) => !/^\s*import\b/.test(f.code[l - 1])) : []),
    ];
    if (!calls.length) continue;
    seen++;
    const afterLines = findLines(f, /\bafter\s*\(/);
    for (const l of calls) if (!afterLines.some((a) => a <= l)) fail(f.path, l, "Server Action calls n8n outside after(): the user waits for n8n");
  }
  if (!seen) note("no Server Action calls n8n");
});

function perRoute(fn, fail, note) {
  if (!callbackRoutes.length) return note("no n8n callback route found");
  for (const r of callbackRoutes) fn(r, fail);
}

check("C9", "callback-raw-body", (fail, note) =>
  perRoute((r) => {
    for (const l of findLines(r, /\b(req|request)\s*\.\s*json\s*\(/)) fail(r.path, l, "request.json() in callback: the signature must be checked on the raw body");
    if (!findLines(r, /\.\s*(text|arrayBuffer)\s*\(/).length) fail(r.path, 1, "callback does not read the raw body with request.text()");
  }, fail, note));

check("C10", "verify-before-parse", (fail, note) =>
  perRoute((r) => {
    const verify = findLines(r, /timingSafeEqual|\bverif\w*\s*\(/i)[0];
    const parse = findLines(r, /JSON\.parse\s*\(|\bparse(?!Int|Float)\w*\s*\(|\.\s*json\s*\(\s*\)/)[0];
    if (!verify) fail(r.path, 1, "no signature verification call found in the callback route");
    else if (parse && parse < verify) fail(r.path, parse, `body parsed on line ${parse} before the signature check on line ${verify}`);
  }, fail, note));

check("C11", "signature-compare", (fail, note) => {
  if (!callbackRoutes.length && !callbackFiles.length) return note("no n8n callback code found");
  for (const f of [...new Set([...callbackRoutes, ...callbackFiles, ...codeFiles.filter((x) => /^(src\/)?lib\/n8n\//.test(x.path))])])
    for (const l of findLines(f, /(signature|digest|hmac|expected)\w*\s*(!==?|===?)|(!==?|===?)\s*\w*(signature|digest|hmac|expected)/i))
      if (!/\.length\s*(!==?|===?)|(!==?|===?)\s*[\w.]*\.length/.test(f.code[l - 1]) && !/===?\s*(null|undefined)|typeof/.test(f.code[l - 1]))
        fail(f.path, l, "signature compared with ===/!==; use crypto.timingSafeEqual after a length check");
  for (const r of callbackRoutes) if (!/timingSafeEqual/.test(helperText(r))) fail(r.path, 1, "no crypto.timingSafeEqual in the callback code");
  if (!callbackRoutes.length && !callbackFiles.some((f) => /timingSafeEqual/.test(f.code.join("\n")))) fail(callbackFiles[0].path, 1, "no crypto.timingSafeEqual in the callback code");
});

check("C12", "timestamp-window", (fail, note) =>
  perRoute((r) => {
    const all = helperText(r);
    if (!/x-n8n-timestamp/i.test(all)) fail(r.path, 1, "callback does not read x-n8n-timestamp");
    else if (!/\b300\b|5\s*\*\s*60\b/.test(all)) fail(r.path, 1, "no 300 s window for x-n8n-timestamp");
  }, fail, note));

check("C13", "callback-idempotency", (fail, note) =>
  perRoute((r) => {
    if (!/["'`]idempotency-key["'`]/i.test(helperText(r))) fail(r.path, 1, "callback route does not read the idempotency-key header");
  }, fail, note));

check("C14", "no-edge-runtime", (fail) => {
  for (const f of codeFiles) for (const l of findLines(f, /export\s+const\s+runtime\s*=\s*["']edge["']/)) fail(f.path, l, 'runtime = "edge": the contract needs node:crypto');
});

const SENSITIVE = /\b(raw|rawBody|body|payload|formData|headers|envelope|values)\b(?!\s*[.(\[])|\b(email|phone|token|secret|signature|password|ipAddress|fullName|firstName|lastName)\b|JSON\.stringify|process\.env/i;
check("C15", "no-sensitive-logs", (fail, note) => {
  const scope = [
    ...(clientModule ? [clientModule] : []),
    ...callbackRoutes,
    ...codeFiles.filter((f) => /^(src\/)?lib\/n8n\//.test(f.path)),
    ...n8nFetches.map((x) => x.file),
    ...codeFiles.filter((f) => isServerActionFile(f) && n8nCallNames(f).length > 0),
  ];
  if (!scope.length) return note("no n8n code found");
  for (const f of new Set(scope))
    for (const l of findLines(f, /\bconsole\s*\.\s*(log|info|warn|error|debug)\s*\(/)) {
      const text = callText(f, l - 1).replace(/Buffer\.byteLength\([^)]*\)/g, "").replace(/\.name\b/g, "");
      const m = text.match(SENSITIVE);
      if (m) fail(f.path, l, `log line mentions "${m[0]}": no bodies, personal data, tokens or signatures in logs`);
    }
});

// ---------------------------------------------------------------- --changed-since
let changed = null; // Map<path, Set<line> | "all">
if (args["changed-since"]) {
  const ref = args["changed-since"];
  const git = (...a) =>
    execFileSync("git", ["-C", root, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("rev-parse", "--verify", `${ref}^{commit}`);
  } catch {
    console.error(`--changed-since: unknown git ref "${ref}" in ${root}`);
    process.exit(2);
  }
  changed = new Map();
  let current = null;
  for (const line of git("diff", "-U0", "--no-color", ref, "--").split("\n")) {
    if (line.startsWith("+++ ")) {
      current = line === "+++ /dev/null" ? null : line.slice(6);
      if (current && !changed.has(current)) changed.set(current, new Set());
    } else if (line.startsWith("@@") && current) {
      const m = line.match(/\+(\d+)(?:,(\d+))?/);
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      for (let i = start; i < start + count; i++) changed.get(current).add(i);
    }
  }
  for (const p of git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean)) changed.set(p, "all");
  // Files that are new since ref (added, not just modified) count as fully changed.
  for (const p of git("diff", "--name-only", "--diff-filter=A", ref, "--").split("\n").filter(Boolean)) changed.set(p, "all");
}
const inScope = ({ path, line }) => {
  if (!changed) return true;
  const c = changed.get(path);
  if (!c) return false;
  return c === "all" || line === 0 || c.has(line);
};

// ---------------------------------------------------------------- report
console.log(`check-contract: ${root}`);
console.log(
  `scanned ${codeFiles.length} code files${envFile ? " + .env.example" : ""}` +
    (changed ? `; --changed-since ${args["changed-since"]}: ${changed.size} changed file(s), only their changed lines` : ""),
);
console.log("");
let failed = 0;
for (const r of results) {
  const findings = r.findings.filter(inScope);
  const label = `${r.id.padEnd(4)}${r.name.padEnd(24)}`;
  if (findings.length) {
    failed++;
    console.log(`${label}FAIL`);
    // Every FAIL is printed as file:line; line 0 marks a whole-file problem (e.g. a missing file) and prints as :1.
    for (const x of findings) console.log(`      ${x.path}:${x.line || 1}  ${x.message}${x.line ? "" : " (whole file)"}`);
  } else {
    const hidden = r.findings.length - findings.length;
    console.log(`${label}PASS${r.note ? `  (n/a: ${r.note})` : ""}${hidden ? `  (${hidden} finding(s) outside --changed-since)` : ""}`);
  }
}
console.log(`\n${failed} FAIL, ${results.length - failed} PASS`);
process.exit(failed ? 1 : 0);
