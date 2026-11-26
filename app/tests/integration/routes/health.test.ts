import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";
import { createHealthHandler, createLazyHealthHandler } from "@/server/http/health";
import { loadPolicies } from "@/server/policies";

// Route-level tests for GET /api/health (TAC-002, ADR-002 §5). Real policies and a real env parse;
// the response carries model ids and counts only, never the API key.

const REPO_DIR = path.resolve(import.meta.dirname, "../../../..");
const POLICIES_DIR = path.join(REPO_DIR, "docs", "policies");
const FAKE_KEY = "test-key-not-real";

function testEnv() {
  return parseEnv({ OPENROUTER_API_KEY: FAKE_KEY, LLM_MODEL: "openai/gpt-6-luna" }, REPO_DIR);
}

describe("GET /api/health", () => {
  it("returns 200 with rule counts, the decisions switch and the model ids", async () => {
    const env = testEnv();
    const policies = loadPolicies(POLICIES_DIR);
    const health = createHealthHandler({ env, policies });

    const res = await health();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      policies: { return: number; complaint: number };
      decisionsEnabled: boolean;
      models: Record<string, string>;
    };
    expect(body.status).toBe("ok");
    expect(body.policies.return).toBe(21);
    expect(body.policies.complaint).toBe(21);
    expect(body.decisionsEnabled).toBe(true);
    expect(body.models).toEqual({
      vision: env.VISION_MODEL,
      decision: env.DECISION_MODEL,
      chat: env.CHAT_MODEL,
      decisions: env.DECISIONS_MODEL,
    });
  });

  it("does not expose the API key in the body", async () => {
    const health = createHealthHandler({ env: testEnv(), policies: loadPolicies(POLICIES_DIR) });

    const text = await (await health()).text();

    expect(text).not.toContain(FAKE_KEY);
  });

  it("answers 500 INTERNAL when the dependencies cannot be built", async () => {
    const health = createLazyHealthHandler(() => {
      throw new Error(`cannot read ${FAKE_KEY}`);
    });

    const res = await health();
    const text = await res.text();

    expect(res.status).toBe(500);
    expect((JSON.parse(text) as { error: { code: string } }).error.code).toBe("INTERNAL");
    expect(text).not.toContain(FAKE_KEY);
  });
});
