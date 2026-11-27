// Model-facing and stored AI schemas (ADR-001 §4). Every model-facing field has a .describe()
// text because it becomes part of the JSON schema the model sees. Length limits are enforced by
// the guardrails (ADR-001 §3.5 rule 5), not here, so a too-long text is a guardrail violation.
import { z } from "zod";
import {
  CATEGORY_MATCHES,
  DAMAGE_SEVERITIES,
  DAMAGE_TYPES,
  DECISION_SOURCES,
  DETECTED_CATEGORIES,
  LIKELY_CAUSES,
  LUNA_KEYS,
  LUNA_SIGNAL_STATUSES,
  LUNA_STATUSES,
  OUTCOMES,
  REMEDIES,
  SIGNS_OF_USE,
  TIMING_STATUSES,
  UNUSABLE_REASONS,
} from "./enums";

export const RULE_ID = /^[RC]-\d+\.\d+$/;
const isoDate = z.iso.date();

// ---------- Luna pre-check ----------
export const lunaSignalSchema = z.object({
  key: z.enum(LUNA_KEYS),
  type: z.enum(["noul", "choice"]),
  value: z.union([z.boolean(), z.string(), z.null()]),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
  confidence: z.number().min(0).max(1).nullable(),
  certainty: z.number().min(0).max(1),
  status: z.enum(LUNA_SIGNAL_STATUSES),
});
export type LunaSignal = z.infer<typeof lunaSignalSchema>;

export const lunaSignalsSchema = z.object({
  status: z.enum(LUNA_STATUSES),
  model: z.string(),
  latencyMs: z.number().min(0),
  signals: z.array(lunaSignalSchema),
  derivedCategoryMatch: z.enum(CATEGORY_MATCHES),
});
export type LunaSignals = z.infer<typeof lunaSignalsSchema>;

// ---------- Vision analysis ----------
export const imageAnalysisSchema = z.object({
  imageUsable: z.boolean().describe("The photo is sharp, well lit and complete enough to judge the device's condition."),
  unusableReason: z.enum(UNUSABLE_REASONS).nullable().describe("Why the photo is unusable, or null when it is usable."),
  deviceVisible: z.boolean().describe("An electronic device is clearly the main subject of the photo."),
  detectedCategory: z.enum(DETECTED_CATEGORIES).describe("The device category you see in the photo."),
  categoryMatch: z.enum(CATEGORY_MATCHES).describe("Whether the visible device matches the category the customer selected."),
  damageVisible: z.boolean().describe("Any physical damage or defect is visible."),
  damage: z
    .array(
      z.object({
        type: z.enum(DAMAGE_TYPES).describe("Damage type."),
        location: z.string().describe("Where on the device, in Polish, at most 80 characters."),
        severity: z.enum(DAMAGE_SEVERITIES).describe("How serious the damage looks."),
      }),
    )
    .describe("Visible damage items, at most 5; empty when none."),
  likelyCause: z.enum(LIKELY_CAUSES).nullable().describe("Complaint cases: most likely cause. Return cases: null."),
  signsOfUse: z.enum(SIGNS_OF_USE).nullable().describe("Return cases: visible signs of use. Complaint cases: null."),
  resellableAsNew: z.boolean().nullable().describe("Return cases: could be resold as new. Complaint cases: null."),
  observationsPl: z.string().describe("Factual observations in Polish, at most 600 characters. No decision."),
  lunaVerification: z
    .array(
      z.object({
        key: z.enum(LUNA_KEYS).describe("The Luna question key you are verifying."),
        agrees: z.enum(["yes", "no", "partly"]).describe("Whether your own judgement agrees with Luna's answer."),
        notePl: z.string().describe("Short reason in Polish, at most 160 characters."),
      }),
    )
    .describe("One entry for every Luna signal that has a value."),
});
export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;

// ---------- Decision ----------
export const decisionDraftSchema = z.object({
  outcome: z.enum(OUTCOMES).describe("Preliminary outcome."),
  remedy: z.enum(REMEDIES).nullable().describe("Suggested remedy allowed for this outcome and case type, or null."),
  citedRuleIds: z
    .array(z.string().regex(RULE_ID))
    .min(1)
    .describe("Policy rule IDs this decision relies on, for example R-2.1 or C-3.2."),
  photoSummaryPl: z.string().describe("What the photo shows, in Polish, at most 500 characters."),
  justificationPl: z.string().describe("Why this outcome follows from the policy, in Polish, at most 1200 characters."),
  nextStepsPl: z.array(z.string()).describe("2 to 5 next steps for the customer, in Polish."),
  clarifyingQuestionsPl: z
    .array(z.string())
    .describe("0 to 3 questions for the customer; at least 1 when the outcome is MANUAL_REVIEW."),
});
export type DecisionDraft = z.infer<typeof decisionDraftSchema>;

export const decisionSchema = decisionDraftSchema.extend({
  version: z.number().int().min(1),
  source: z.enum(DECISION_SOURCES),
  appliedGuardrails: z.array(z.string()),
  createdAt: z.iso.datetime(),
});
export type Decision = z.infer<typeof decisionSchema>;

// ---------- Gates ----------
export const timingStatusSchema = z.object({
  status: z.enum(TIMING_STATUSES),
  startDate: isoDate,
  today: isoDate,
  daysSinceStart: z.number().int(),
  deadline: isoDate,
  ruleId: z.string().regex(RULE_ID),
});
export type TimingStatus = z.infer<typeof timingStatusSchema>;

export const gateResultSchema = z.object({
  timing: timingStatusSchema,
  forcedOutcome: z.enum(OUTCOMES).nullable(),
  requiredRuleIds: z.array(z.string().regex(RULE_ID)),
  reasonCodes: z.array(z.string()),
});
export type GateResult = z.infer<typeof gateResultSchema>;

// ---------- Chat tool: updateDecision (ADR-001 §3.8) ----------
export const updateDecisionInputSchema = z.object({
  newFactPl: z.string().min(10).max(500).describe("The new fact from the customer, in Polish."),
  claimedDeliveryDate: isoDate.nullable().describe("Delivery date the customer states (YYYY-MM-DD), or null."),
  outcome: decisionDraftSchema.shape.outcome,
  remedy: decisionDraftSchema.shape.remedy,
  citedRuleIds: decisionDraftSchema.shape.citedRuleIds,
  justificationPl: decisionDraftSchema.shape.justificationPl,
  nextStepsPl: decisionDraftSchema.shape.nextStepsPl,
});
export type UpdateDecisionInput = z.infer<typeof updateDecisionInputSchema>;

export const updateDecisionOutputSchema = z.discriminatedUnion("accepted", [
  z.object({ accepted: z.literal(true), decision: decisionSchema }),
  z.object({ accepted: z.literal(false), reason: z.string(), violations: z.array(z.string()) }),
]);
export type UpdateDecisionOutput = z.infer<typeof updateDecisionOutputSchema>;
