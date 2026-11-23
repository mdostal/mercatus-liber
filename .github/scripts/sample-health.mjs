#!/usr/bin/env node
/**
 * Checks that the public sample stores and docs actually render: each URL in
 * .github/sample-health/checks.json must answer 200 and contain every
 * `expect` string. Read-only GET requests to pages a visitor would open (no
 * carts, no checkout), sent with a recognizable User-Agent. A slow cold
 * start is retried before it counts as a failure, so one sleepy serverless
 * function doesn't open an issue.
 *
 * Writes a Markdown report to $GITHUB_STEP_SUMMARY (and stdout) and
 * the failures to sample-health-failures.md for the workflow's issue step.
 * Exits 1 when any check fails.
 *
 *   node .github/scripts/sample-health.mjs [--only <substring>]
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const checks = JSON.parse(readFileSync(join(here, "..", "sample-health", "checks.json"), "utf8"));
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex > -1 ? process.argv[onlyIndex + 1] : null;

const USER_AGENT = "mercatus-liber-sample-health/1 (+https://github.com/mdostal/mercatus-liber/blob/master/.github/workflows/sample-health.yml)";
const TIMEOUT_MS = 45_000;
const RETRY_WAITS_MS = [10_000, 30_000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function attempt(check) {
  const started = Date.now();
  try {
    const res = await fetch(check.url, { headers: { "user-agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await res.text();
    const ms = Date.now() - started;
    if (res.status !== 200) return { ok: false, ms, status: res.status, why: `HTTP ${res.status}` };
    const missing = (check.expect ?? []).filter((text) => !body.includes(text));
    if (missing.length > 0) return { ok: false, ms, status: res.status, why: `missing ${missing.map((m) => `"${m}"`).join(", ")}` };
    return { ok: true, ms, status: res.status };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, status: 0, why: err?.name === "TimeoutError" ? `no answer in ${TIMEOUT_MS / 1000}s` : String(err?.message ?? err) };
  }
}

async function run(check) {
  let result = await attempt(check);
  for (const wait of RETRY_WAITS_MS) {
    if (result.ok) break;
    await sleep(wait);
    result = await attempt(check);
  }
  return { ...check, ...result };
}

const selected = checks.filter((c) => !only || c.name.includes(only) || c.url.includes(only));
const results = await Promise.all(selected.map(run));
const failed = results.filter((r) => !r.ok);

const row = (r) => `| ${r.ok ? "✅" : "❌"} | ${r.group} | ${r.name} | [${r.url.replace(/^https:\/\//, "")}](${r.url}) | ${r.status || "–"} | ${(r.ms / 1000).toFixed(1)}s | ${r.ok ? "" : r.why} |`;
const report = [
  `### Sample health: ${results.length - failed.length} of ${results.length} up`,
  "",
  "| | Group | Check | URL | Status | Time | Problem |",
  "|---|---|---|---|---|---|---|",
  ...results.map(row),
  "",
].join("\n");

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
writeFileSync(
  "sample-health-failures.md",
  failed.length === 0 ? "" : ["| Check | URL | Problem |", "|---|---|---|", ...failed.map((r) => `| ${r.name} | ${r.url} | ${r.why} |`)].join("\n") + "\n",
);
process.exit(failed.length > 0 ? 1 : 0);
