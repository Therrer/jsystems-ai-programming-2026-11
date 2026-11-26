#!/usr/bin/env node
// T21 — record our own API's real responses (success and errors) from the running production build.
// Usage (from app/): node scripts/capture-app.mjs [label]   — the server must be running on :3000.
// Image bytes are never written; request bodies are described, not copied.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const APP = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(APP, "..");
const OUT = path.join(APP, "tests/fixtures/recorded");
const BASE = "http://localhost:3000";
const label = process.argv[2] ?? "ok";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
const daysAgo = (n) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

async function call(name, method, url, { body, describe, stream } = {}) {
  const started = Date.now();
  const res = await fetch(BASE + url, { method, body, headers: body && !(body instanceof FormData) ? { "content-type": "application/json" } : undefined });
  const text = await res.text();
  const headers = {};
  res.headers.forEach((v, k) => { if (!["set-cookie", "date"].includes(k)) headers[k] = v; });
  let json = null;
  if (!stream) { try { json = JSON.parse(text); } catch { /* not JSON */ } }
  const record = {
    meta: { name, capturedAt: new Date().toISOString(), task: "T21 app capture", label, durationMs: Date.now() - started },
    request: { method, url, body: describe ?? null },
    response: { status: res.status, headers, body: json, rawText: json === null ? text.replace(/user_[A-Za-z0-9]{20,}/g, "<redacted-account-id>") : undefined },
  };
  writeFileSync(path.join(OUT, `app-${name}.json`), JSON.stringify(record, null, 2) + "\n");
  console.log(`${name.padEnd(28)} ${res.status} ${Date.now() - started} ms`);
  return { status: res.status, json, text };
}

function caseForm(fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (file) fd.set("image", new File([readFileSync(file.path)], path.basename(file.path), { type: file.type }));
  return fd;
}
const laptop2 = { path: path.join(REPO, "assets/example-images/laptop-2.webp"), type: "image/webp" };
const returnFields = { caseType: "return", category: "laptop", modelName: "Lenovo ThinkPad E14", purchaseDate: daysAgo(5), description: "" };
const describeForm = (fields, file) => ({ multipart: { ...fields, image: file ? `${path.basename(file.path)} (${file.type}, real example photo)` : null } });

if (label === "invalid-key") {
  // Server started with an invalid OPENROUTER_API_KEY: the AI stage fails for real.
  await call("cases-502-invalid-key", "POST", "/api/cases", { body: caseForm(returnFields, laptop2), describe: describeForm(returnFields, laptop2) });
} else {
  await call("health-200", "GET", "/api/health");
  const created = await call("cases-201", "POST", "/api/cases", { body: caseForm(returnFields, laptop2), describe: describeForm(returnFields, laptop2) });
  const caseId = created.json?.caseId;
  await call("decision-200", "POST", `/api/cases/${caseId}/decision`);
  const msg = { id: "capture-u1", role: "user", parts: [{ type: "text", text: "Jaki model zgłosiłem?" }] };
  await call("chat-200-stream", "POST", "/api/chat", { body: JSON.stringify({ id: caseId, message: msg, trigger: "submit-message" }), describe: { id: "<caseId>", message: msg, trigger: "submit-message" }, stream: true });
  const bad = { ...returnFields, modelName: " ", purchaseDate: daysAgo(-3) };
  await call("cases-400-validation", "POST", "/api/cases", { body: caseForm(bad, laptop2), describe: describeForm(bad, laptop2) });
  const prd = { path: path.join(REPO, "docs/PRD.md"), type: "image/jpeg" };
  await call("cases-415-not-an-image", "POST", "/api/cases", { body: caseForm(returnFields, prd), describe: describeForm(returnFields, prd) });
  await call("decision-404-unknown", "POST", "/api/cases/00000000-0000-4000-8000-000000000000/decision");
  await call("chat-404-unknown", "POST", "/api/chat", { body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000000", message: msg, trigger: "submit-message" }), describe: { id: "<unknown uuid>", message: msg } });
  await call("delete-204", "DELETE", `/api/cases/${caseId}`);
}
