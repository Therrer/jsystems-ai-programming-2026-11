import "server-only";

import { convertToModelMessages, createUIMessageStreamResponse, generateId, stepCountIs, streamText, toUIMessageStream, type LanguageModel } from "ai";
import type { Decision } from "@/lib/shared/schemas/ai";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";
import { CHAT_ERROR_MESSAGE } from "@/lib/shared/strings/common";
import { getAiProvider } from "@/server/ai/provider";
import { chatSystemPrompt, decisionSummary, toModelSafeMessages } from "@/server/ai/prompts/chat";
import { createUpdateDecisionTool, type UpdateDecisionContext } from "@/server/ai/update-decision-tool";
import type { Case } from "@/server/cases/store";
import { mapProviderError } from "@/server/errors";
import { log } from "@/server/log";
import type { Policy } from "@/server/policies";

// Chat agent (ADR-001 §3.8, PRD §4.5, TAC-001-08). Streams one answer per customer message. Provider
// errors become a fixed Polish text; the raw error text never reaches the client.

export interface ChatAgent {
  stream(input: {
    chatCase: Case;
    newMessage: CaseUIMessage;
    policy: Policy;
    today: string;
    signal?: AbortSignal;
    recordDecision(decision: Decision): void;
    onFinish(messages: CaseUIMessage[]): void;
    onError(): void;
  }): Promise<Response>;
}

const TOTAL_MS = 60_000;
const FIRST_CHUNK_MS = 20_000;

export function createChatAgent(deps: {
  model: LanguageModel;
  totalMs?: number;
  firstChunkMs?: number;
  now?: () => Date;
}): ChatAgent {
  const totalMs = deps.totalMs ?? TOTAL_MS;
  const firstChunkMs = deps.firstChunkMs ?? FIRST_CHUNK_MS;
  const now = deps.now ?? (() => new Date());

  return {
    async stream(input) {
      const { chatCase, newMessage, policy, today, signal } = input;
      const originalMessages = [...chatCase.messages, newMessage];

      const messages = await convertToModelMessages<CaseUIMessage>(toModelSafeMessages(originalMessages), {
        convertDataPart: (part) =>
          part.type === "data-decision" ? { type: "text", text: decisionSummary(part.data) } : undefined,
      });

      const ctx: UpdateDecisionContext = {
        caseType: chatCase.form.caseType,
        form: chatCase.form,
        analysis: chatCase.analysis!,
        today,
        policyRuleIds: policy.ruleIds,
        currentDecision: chatCase.decisions.at(-1)!,
        nextVersion: chatCase.decisions.length + 1,
        recordDecision: input.recordDecision,
        now,
      };
      const tools = { updateDecision: createUpdateDecisionTool(ctx) };

      const result = streamText({
        model: deps.model,
        system: chatSystemPrompt({ chatCase, policy, today }),
        messages,
        tools,
        stopWhen: stepCountIs(2),
        maxRetries: 1,
        timeout: { totalMs, firstChunkMs },
        abortSignal: signal,
      });

      // ai@7.0.183 calls onError twice for one failure: once for the provider error and again for the
      // error chunk it writes (with the fixed text). Only the first call is reported.
      let reported = false;
      return createUIMessageStreamResponse({
        stream: toUIMessageStream({
          stream: result.stream,
          tools,
          originalMessages,
          generateMessageId: generateId,
          messageMetadata: ({ part }) => (part.type === "start" ? { createdAt: now().toISOString() } : undefined),
          onError: (error) => {
            if (!reported) {
              reported = true;
              log.warn("chat_failed", { code: mapProviderError(error).code });
              input.onError();
            }
            return CHAT_ERROR_MESSAGE;
          },
          // A failed turn is not stored as an answer; the client shows the retry state instead.
          onEnd: ({ messages: finished }) => {
            if (!reported) input.onFinish(finished);
          },
        }),
      });
    },
  };
}

let cached: ChatAgent | undefined;

/** Production agent: the chat model from the cached OpenRouter provider. */
export function getChatAgent(): ChatAgent {
  cached ??= createChatAgent({ model: getAiProvider().model("chat") });
  return cached;
}
