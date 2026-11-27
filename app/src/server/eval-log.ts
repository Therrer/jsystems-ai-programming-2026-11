import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { Decision, ImageAnalysis, LunaSignal, LunaSignals } from "@/lib/shared/schemas/ai";
import type { CaseType, Category, LunaKey, Outcome } from "@/lib/shared/schemas/enums";

// Evaluation log (ADR-001 §3.9, TAC-001-07): one JSON line per decided case. Only structured fields
// enter the record: no customer text, no observations, no image data.

export type Agreement = "agree" | "disagree" | "n/a";

export interface EvalRecord {
  ts: string;
  caseId: string;
  caseType: CaseType;
  category: Category;
  lunaStatus: LunaSignals["status"];
  luna: Array<{ key: LunaKey; value: boolean | string | null; certainty: number; status: LunaSignal["status"] }>;
  analysis: {
    imageUsable: boolean;
    deviceVisible: boolean;
    categoryMatch: ImageAnalysis["categoryMatch"];
    detectedCategory: ImageAnalysis["detectedCategory"];
    damageVisible: boolean;
    likelyCause: ImageAnalysis["likelyCause"];
    signsOfUse: ImageAnalysis["signsOfUse"];
    resellableAsNew: ImageAnalysis["resellableAsNew"];
  };
  agreement: Partial<Record<LunaKey, Agreement>>;
  outcome: Outcome;
  appliedGuardrails: string[];
  latencyMs: { luna?: number; vision?: number; decision: number };
  models: { vision: string; decision: string; decisions: string };
}

export interface EvalLogger {
  append(record: EvalRecord): void;
}

export function createEvalLogger(logPath: string | undefined): EvalLogger | undefined {
  if (logPath === undefined) return undefined;
  return {
    append(record) {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
    },
  };
}

// Luna condition option -> ImageAnalysis.signsOfUse level (ADR-001 §3.2 criteria, §4).
const CONDITION_TO_SIGNS: Record<string, NonNullable<ImageAnalysis["signsOfUse"]>> = {
  like_new: "none",
  light_signs_of_use: "light",
  clear_signs_of_use: "clear",
  damaged: "heavy",
};

function compareBoolean(signal: LunaSignal | undefined, analysisValue: boolean | null): Agreement {
  if (!signal || signal.status === "not_answered" || typeof signal.value !== "boolean" || analysisValue === null) return "n/a";
  return signal.value === analysisValue ? "agree" : "disagree";
}

function compareText(signal: LunaSignal | undefined, analysisValue: string | null, map?: Record<string, string>): Agreement {
  if (!signal || signal.status === "not_answered" || typeof signal.value !== "string" || analysisValue === null) return "n/a";
  const expected = map ? map[signal.value] : signal.value;
  if (expected === undefined) return "n/a";
  return expected === analysisValue ? "agree" : "disagree";
}

function agreementOf(luna: LunaSignals, analysis: ImageAnalysis): Partial<Record<LunaKey, Agreement>> {
  const byKey = new Map(luna.signals.map((signal) => [signal.key, signal] as const));
  return {
    device_visible: compareBoolean(byKey.get("device_visible"), analysis.deviceVisible),
    image_usable: compareBoolean(byKey.get("image_usable"), analysis.imageUsable),
    damage_visible: compareBoolean(byKey.get("damage_visible"), analysis.damageVisible),
    resellable_as_new: compareBoolean(byKey.get("resellable_as_new"), analysis.resellableAsNew),
    category: compareText(byKey.get("category"), analysis.detectedCategory),
    likely_cause: compareText(byKey.get("likely_cause"), analysis.likelyCause),
    condition: compareText(byKey.get("condition"), analysis.signsOfUse, CONDITION_TO_SIGNS),
  };
}

export function buildEvalRecord(input: {
  caseId: string;
  caseType: CaseType;
  category: Category;
  luna: LunaSignals;
  analysis: ImageAnalysis;
  decision: Decision;
  latencyMs: { luna?: number; vision?: number; decision: number };
  models: { vision: string; decision: string; decisions: string };
  ts: string;
}): EvalRecord {
  const { analysis, decision, luna } = input;
  return {
    ts: input.ts,
    caseId: input.caseId,
    caseType: input.caseType,
    category: input.category,
    lunaStatus: luna.status,
    luna: luna.signals.map((signal) => ({
      key: signal.key,
      value: signal.value,
      certainty: signal.certainty,
      status: signal.status,
    })),
    analysis: {
      imageUsable: analysis.imageUsable,
      deviceVisible: analysis.deviceVisible,
      categoryMatch: analysis.categoryMatch,
      detectedCategory: analysis.detectedCategory,
      damageVisible: analysis.damageVisible,
      likelyCause: analysis.likelyCause,
      signsOfUse: analysis.signsOfUse,
      resellableAsNew: analysis.resellableAsNew,
    },
    agreement: agreementOf(luna, analysis),
    outcome: decision.outcome,
    appliedGuardrails: decision.appliedGuardrails,
    latencyMs: input.latencyMs,
    models: input.models,
  };
}
