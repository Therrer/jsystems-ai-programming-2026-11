import path from "node:path";
import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/server/env";

const FAKE_KEY = "test-key-not-real";
const CWD = path.resolve("/repo/app");
const LLM = "openai/gpt-6-luna";

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("parseEnv", () => {
  it("applies defaults for a minimal valid environment", () => {
    const env = parseEnv({ OPENROUTER_API_KEY: FAKE_KEY, LLM_MODEL: LLM }, CWD);

    expect(env.OPENROUTER_API_KEY).toBe(FAKE_KEY);
    expect(env.LLM_MODEL).toBe(LLM);
    expect(env.VISION_MODEL).toBe(LLM);
    expect(env.DECISION_MODEL).toBe(LLM);
    expect(env.CHAT_MODEL).toBe(LLM);
    expect(env.DECISIONS_MODEL).toBe("openai/gpt-6-luna-decisions");
    expect(env.DECISIONS_ENABLED).toBe(true);
    expect(env.DECISIONS_CONFIDENCE_THRESHOLD).toBe(0.8);
    expect(env.POLICIES_DIR).toBe(path.resolve(CWD, "..", "docs", "policies"));
    expect(env.CASE_TTL_MINUTES).toBe(120);
    expect(env.EVAL_LOG_PATH).toBeUndefined();
  });

  it("uses explicit role models and treats blank optional values as unset", () => {
    const env = parseEnv(
      {
        OPENROUTER_API_KEY: FAKE_KEY,
        LLM_MODEL: LLM,
        VISION_MODEL: "vendor/vision-model",
        CHAT_MODEL: "   ",
        EVAL_LOG_PATH: "",
      },
      CWD,
    );

    expect(env.VISION_MODEL).toBe("vendor/vision-model");
    expect(env.CHAT_MODEL).toBe(LLM);
    expect(env.EVAL_LOG_PATH).toBeUndefined();
  });

  it("reports a missing API key by name and never echoes other values", () => {
    const error = captureError(() =>
      parseEnv({ LLM_MODEL: "test-llm-value-visible", CASE_TTL_MINUTES: "test-ttl-value-visible" }, CWD),
    );

    expect(error).toBeInstanceOf(EnvError);
    const envError = error as EnvError;
    expect([...envError.variables].sort()).toEqual(["CASE_TTL_MINUTES", "OPENROUTER_API_KEY"]);
    expect(envError.message).toContain("OPENROUTER_API_KEY");
    expect(envError.message).toContain("CASE_TTL_MINUTES");
    expect(envError.message).not.toContain("test-llm-value-visible");
    expect(envError.message).not.toContain("test-ttl-value-visible");
  });

  it("rejects a whitespace-only API key", () => {
    const error = captureError(() => parseEnv({ OPENROUTER_API_KEY: "   ", LLM_MODEL: LLM }, CWD));

    expect(error).toBeInstanceOf(EnvError);
    expect((error as EnvError).variables).toEqual(["OPENROUTER_API_KEY"]);
  });

  it("rejects a confidence threshold above 1 and names the variable without its value", () => {
    const error = captureError(() =>
      parseEnv(
        { OPENROUTER_API_KEY: FAKE_KEY, LLM_MODEL: LLM, DECISIONS_CONFIDENCE_THRESHOLD: "1.5" },
        CWD,
      ),
    );

    expect(error).toBeInstanceOf(EnvError);
    expect((error as EnvError).variables).toEqual(["DECISIONS_CONFIDENCE_THRESHOLD"]);
    expect((error as EnvError).message).toContain("DECISIONS_CONFIDENCE_THRESHOLD");
    expect((error as EnvError).message).not.toContain(FAKE_KEY);
  });

  it("parses DECISIONS_ENABLED=false as the boolean false", () => {
    const env = parseEnv(
      { OPENROUTER_API_KEY: FAKE_KEY, LLM_MODEL: LLM, DECISIONS_ENABLED: "false" },
      CWD,
    );

    expect(env.DECISIONS_ENABLED).toBe(false);
  });

  it("rejects a DECISIONS_ENABLED value that is neither true nor false", () => {
    const error = captureError(() =>
      parseEnv({ OPENROUTER_API_KEY: FAKE_KEY, LLM_MODEL: LLM, DECISIONS_ENABLED: "yes" }, CWD),
    );

    expect((error as EnvError).variables).toEqual(["DECISIONS_ENABLED"]);
  });

  it("rejects CASE_TTL_MINUTES=0 because it must be a positive integer", () => {
    const error = captureError(() =>
      parseEnv({ OPENROUTER_API_KEY: FAKE_KEY, LLM_MODEL: LLM, CASE_TTL_MINUTES: "0" }, CWD),
    );

    expect(error).toBeInstanceOf(EnvError);
    expect((error as EnvError).variables).toEqual(["CASE_TTL_MINUTES"]);
    expect((error as EnvError).message).not.toContain(FAKE_KEY);
  });
});
