// HTTP contracts shared by client and server (ADR-002 §4.1 – §4.2, §5). Route handlers (T20) add
// validateUIMessages and text-only checks on top of chatRequestSchema.
import { z } from "zod";
import type { UIMessage } from "ai";
import type { Decision, UpdateDecisionInput, UpdateDecisionOutput } from "./ai";
import { API_ERROR_CODES, FIELD_ERROR_CODES } from "./enums";

export const createCaseResponseSchema = z.object({ caseId: z.uuid() });
export type CreateCaseResponse = z.infer<typeof createCaseResponseSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    messagePl: z.string(),
    fieldErrors: z.record(z.string(), z.enum(FIELD_ERROR_CODES)).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  policies: z.object({ return: z.number().int(), complaint: z.number().int() }),
  decisionsEnabled: z.boolean(),
  models: z.object({ vision: z.string(), decision: z.string(), chat: z.string(), decisions: z.string() }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const CHAT_MESSAGE_MAX = 2000;
export const CHAT_USER_MESSAGE_LIMIT = 40;

export const chatRequestSchema = z.object({
  id: z.uuid(),
  message: z.looseObject({
    id: z.string().min(1),
    role: z.literal("user"),
    parts: z.array(z.looseObject({ type: z.string() })).min(1),
  }),
  trigger: z.enum(["submit-message", "regenerate-message"]),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** AI SDK UI message typed with our metadata, data part and tool (ADR-001 §4). */
export type CaseUIMessage = UIMessage<
  { createdAt: string },
  { decision: Decision },
  { updateDecision: { input: UpdateDecisionInput; output: UpdateDecisionOutput } }
>;

export interface DecisionResponse {
  message: CaseUIMessage;
}
