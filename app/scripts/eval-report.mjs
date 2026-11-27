#!/usr/bin/env node
// Evaluation report (ADR-001 §3.9, ADR-000 TD-05): aggregates the Luna-vs-vision agreement
// recorded by src/server/eval-log.ts (one JSON object per line) into per-key rates by Luna certainty.
// Node built-ins only; no dependencies.

import fs from "node:fs";
import { pathToFileURL } from "node:url";

/** @typedef {"<0.8" | "0.8-0.9" | ">=0.9"} Bucket */
/** @typedef {{ n: number, agree: number, disagree: number, rate: number | null }} BucketStats */
/** @typedef {{ cases: number, keys: Record<string, Record<Bucket, BucketStats>> }} Report */

/** @type {Bucket[]} */
const BUCKETS = ["<0.8", "0.8-0.9", ">=0.9"];

/** @param {number} certainty @returns {Bucket} */
function bucketOf(certainty) {
  if (certainty < 0.8) return "<0.8";
  if (certainty < 0.9) return "0.8-0.9";
  return ">=0.9";
}

function emptyBuckets() {
  /** @type {Record<Bucket, BucketStats>} */
  const buckets = /** @type {any} */ ({});
  for (const bucket of BUCKETS) buckets[bucket] = { n: 0, agree: 0, disagree: 0, rate: null };
  return buckets;
}

/**
 * @param {object[]} lines
 * @returns {Report}
 */
export function buildReport(lines) {
  /** @type {Record<string, Record<Bucket, BucketStats>>} */
  const keys = {};
  for (const line of lines) {
    const record = /** @type {any} */ (line);
    const agreement = record.agreement ?? {};
    const luna = Array.isArray(record.luna) ? record.luna : [];
    for (const [key, verdict] of Object.entries(agreement)) {
      keys[key] ??= emptyBuckets();
      if (verdict !== "agree" && verdict !== "disagree") continue;
      const signal = luna.find((entry) => entry?.key === key);
      if (!signal || typeof signal.certainty !== "number" || !Number.isFinite(signal.certainty)) continue;
      const stats = keys[key][bucketOf(signal.certainty)];
      stats.n += 1;
      if (verdict === "agree") stats.agree += 1;
      else stats.disagree += 1;
    }
  }
  for (const buckets of Object.values(keys)) {
    for (const stats of Object.values(buckets)) {
      stats.rate = stats.n === 0 ? null : stats.agree / stats.n;
    }
  }
  return { cases: lines.length, keys };
}

/**
 * @param {string} text
 * @returns {{ lines: object[], skipped: number }}
 */
export function parseJsonl(text) {
  /** @type {object[]} */
  const lines = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "") continue;
    try {
      const value = JSON.parse(raw);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) lines.push(value);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { lines, skipped };
}

/** @param {BucketStats} stats */
function formatCell(stats) {
  if (stats.n === 0 || stats.rate === null) return "—";
  return `${stats.agree}/${stats.n} (${Math.round(stats.rate * 100)} %)`;
}

/**
 * @param {Report} report
 * @returns {string}
 */
export function formatReport(report) {
  const header = "| Key | <0.8 | 0.8–0.9 | ≥0.9 |";
  const separator = "|---|---|---|---|";
  const rows = Object.entries(report.keys).map(
    ([key, buckets]) => `| ${key} | ${BUCKETS.map((bucket) => formatCell(buckets[bucket])).join(" | ")} |`,
  );
  return [`Cases: ${report.cases}`, "", header, separator, ...rows].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const logPath = positional[0] ?? process.env.EVAL_LOG_PATH ?? ".data/eval.jsonl";

  if (!fs.existsSync(logPath)) {
    console.error(`Evaluation log not found: ${logPath}`);
    process.exitCode = 1;
    return;
  }

  const { lines, skipped } = parseJsonl(fs.readFileSync(logPath, "utf8"));
  const report = buildReport(lines);
  console.log(asJson ? JSON.stringify(report, null, 2) : formatReport(report));
  if (skipped > 0) console.error(`Skipped invalid lines: ${skipped}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
