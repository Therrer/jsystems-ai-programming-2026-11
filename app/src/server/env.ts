import "server-only";

import path from "node:path";
import { z } from "zod";

export interface AppEnv {
  OPENROUTER_API_KEY: string;
  LLM_MODEL: string;
  VISION_MODEL: string;
  DECISION_MODEL: string;
  CHAT_MODEL: string;
  DECISIONS_MODEL: string;
  DECISIONS_ENABLED: boolean;
  DECISIONS_CONFIDENCE_THRESHOLD: number;
  POLICIES_DIR: string;
  CASE_TTL_MINUTES: number;
  EVAL_LOG_PATH: string | undefined;
}

// Lists variable names only. Values never enter the message (ADR-000 §7).
export class EnvError extends Error {
  readonly variables: string[];
  constructor(variables: string[]) {
    super(`Invalid environment variables: ${variables.join(", ")}`);
    this.name = "EnvError";
    this.variables = variables;
  }
}

const DEFAULT_DECISIONS_MODEL = "openai/gpt-6-luna-decisions";

const ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "LLM_MODEL",
  "VISION_MODEL",
  "DECISION_MODEL",
  "CHAT_MODEL",
  "DECISIONS_MODEL",
  "DECISIONS_ENABLED",
  "DECISIONS_CONFIDENCE_THRESHOLD",
  "POLICIES_DIR",
  "CASE_TTL_MINUTES",
  "EVAL_LOG_PATH",
] as const;

const optionalText = z.string().min(1).optional();
const decimal = /^\d+(\.\d+)?$/;
const integer = /^\d+$/;

const schema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),
  VISION_MODEL: optionalText,
  DECISION_MODEL: optionalText,
  CHAT_MODEL: optionalText,
  DECISIONS_MODEL: optionalText,
  DECISIONS_ENABLED: z.enum(["true", "false"]).optional(),
  DECISIONS_CONFIDENCE_THRESHOLD: z
    .string()
    .regex(decimal)
    .transform(Number)
    .pipe(z.number().min(0).max(1))
    .optional(),
  POLICIES_DIR: optionalText,
  CASE_TTL_MINUTES: z
    .string()
    .regex(integer)
    .transform(Number)
    .pipe(z.number().int().positive())
    .optional(),
  EVAL_LOG_PATH: optionalText,
});

// Blank values count as unset: trim, then turn "" into undefined.
function normalise(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Pure: never reads process.env itself.
export function parseEnv(source: Record<string, string | undefined>, cwd: string): AppEnv {
  const input = Object.fromEntries(ENV_KEYS.map((key) => [key, normalise(source[key])]));
  const result = schema.safeParse(input);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new EnvError(names);
  }

  const data = result.data;
  const llmModel = data.LLM_MODEL;
  return {
    OPENROUTER_API_KEY: data.OPENROUTER_API_KEY,
    LLM_MODEL: llmModel,
    VISION_MODEL: data.VISION_MODEL ?? llmModel,
    DECISION_MODEL: data.DECISION_MODEL ?? llmModel,
    CHAT_MODEL: data.CHAT_MODEL ?? llmModel,
    DECISIONS_MODEL: data.DECISIONS_MODEL ?? DEFAULT_DECISIONS_MODEL,
    DECISIONS_ENABLED: data.DECISIONS_ENABLED === undefined ? true : data.DECISIONS_ENABLED === "true",
    DECISIONS_CONFIDENCE_THRESHOLD: data.DECISIONS_CONFIDENCE_THRESHOLD ?? 0.8,
    POLICIES_DIR: data.POLICIES_DIR
      ? path.resolve(cwd, data.POLICIES_DIR)
      : path.resolve(cwd, "..", "docs", "policies"),
    CASE_TTL_MINUTES: data.CASE_TTL_MINUTES ?? 120,
    EVAL_LOG_PATH: data.EVAL_LOG_PATH,
  };
}

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  cached ??= parseEnv(process.env, process.cwd());
  return cached;
}
