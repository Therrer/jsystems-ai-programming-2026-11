"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { ChatMessage } from "@/components/case-chat/chat-message";
import { CaseSummaryPanel } from "@/components/case-chat/case-summary-panel";
import { SessionExpiredAlert } from "@/components/case-chat/session-expired-alert";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ApiError } from "@/lib/client/api";
import { createChatTransport } from "@/lib/client/chat-transport";
import type { FormValues } from "@/lib/client/case-flow";
import { codePointLength } from "@/lib/shared/schemas/case-form";
import { decisionSchema } from "@/lib/shared/schemas/ai";
import { CHAT_MESSAGE_MAX, type CaseUIMessage } from "@/lib/shared/schemas/api";
import {
  ASSISTANT_TYPING,
  CHAT_HEADING,
  CONVERSATION_LABEL,
  MESSAGE_FIELD,
  MESSAGE_PLACEHOLDER,
  SEND_BUTTON,
} from "@/lib/shared/strings/chat";
import { API_ERROR_MESSAGES, CHAT_ERROR_MESSAGE } from "@/lib/shared/strings/common";

export interface CaseChatProps {
  caseId: string;
  values: FormValues;
  previewUrl: string | null;
  firstMessage: CaseUIMessage;
  expired: boolean;
  onSessionExpired: () => void;
  onNewCase: () => void;
  /** CaseApp keeps the stop function so "Nowa sprawa" can end a running stream. */
  registerStop?: (stop: (() => void) | null) => void;
}

/** Counter appears above this many code points (ADR-003 §3.4, PRD §4.7). */
const COUNTER_THRESHOLD = 1800;
const TIME_FORMAT = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  hour: "2-digit",
  minute: "2-digit",
});

const formatTime = (date: Date) => TIME_FORMAT.format(date);

export function CaseChat({
  caseId,
  values,
  previewUrl,
  firstMessage,
  expired,
  onSessionExpired,
  onNewCase,
  registerStop,
}: CaseChatProps) {
  const [transport] = useState(() => createChatTransport());
  const { messages, sendMessage, regenerate, stop, status, error } = useChat<CaseUIMessage>({
    id: caseId,
    messages: [firstMessage],
    transport,
    dataPartSchemas: { decision: decisionSchema },
  });
  const [draft, setDraft] = useState("");

  useEffect(() => {
    registerStop?.(stop);
    return () => registerStop?.(null);
  }, [registerStop, stop]);

  useEffect(() => {
    if (error instanceof ApiError && error.code === "CASE_NOT_FOUND") onSessionExpired();
  }, [error, onSessionExpired]);

  const busy = status === "submitted" || status === "streaming";
  const length = codePointLength(draft);
  const canSend = !expired && !busy && draft.trim().length > 0 && length <= CHAT_MESSAGE_MAX;
  const lastMessage = messages.at(-1);
  const failedId = status === "error" && lastMessage?.role === "user" ? lastMessage.id : null;
  const errorText =
    error instanceof ApiError
      ? error.code === "CASE_NOT_FOUND"
        ? null
        : API_ERROR_MESSAGES[error.code]
      : error
        ? CHAT_ERROR_MESSAGE
        : null;

  function handleSubmit(message: { text: string }, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.text.trim();
    if (expired || busy || text.length === 0 || codePointLength(message.text) > CHAT_MESSAGE_MAX) return;
    // The client stamps its own send time (the server keeps its own createdAt for stored messages).
    void sendMessage({ text, metadata: { createdAt: new Date().toISOString() } });
    setDraft("");
  }

  function timeOf(message: CaseUIMessage): string {
    const createdAt = message.metadata?.createdAt;
    return createdAt ? formatTime(new Date(createdAt)) : "";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start">
      <h1 className="sr-only">{CHAT_HEADING}</h1>
      <aside className="shrink-0 lg:sticky lg:top-4 lg:w-80">
        <CaseSummaryPanel values={values} previewUrl={previewUrl} />
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:h-[calc(100dvh-8rem)]">
        <h2 className="sr-only">{CONVERSATION_LABEL}</h2>
        <Conversation className="min-h-[50dvh] flex-1 lg:min-h-0">
          <ConversationContent scrollLabel={CONVERSATION_LABEL}>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                time={timeOf(message)}
                failed={message.id === failedId}
                onRetry={() => {
                  void regenerate();
                }}
              />
            ))}
            {busy ? <Shimmer>{ASSISTANT_TYPING}</Shimmer> : null}
            {errorText ? <p className="text-sm text-destructive">{errorText}</p> : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {expired ? <SessionExpiredAlert onNewCase={onNewCase} /> : null}

        <PromptInput onSubmit={handleSubmit} className="shrink-0">
          <PromptInputBody>
            <PromptInputTextarea
              aria-label={MESSAGE_FIELD}
              placeholder={MESSAGE_PLACEHOLDER}
              disabled={expired || busy}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {length > COUNTER_THRESHOLD ? `${length} / ${CHAT_MESSAGE_MAX}` : ""}
            </span>
            <PromptInputSubmit disabled={!canSend} aria-label={SEND_BUTTON} />
          </PromptInputFooter>
        </PromptInput>
      </section>
    </div>
  );
}
