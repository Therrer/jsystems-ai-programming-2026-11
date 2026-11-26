"use client";

import { DecisionBlock } from "@/components/case-chat/decision-block";
import { DecisionNotice } from "@/components/case-chat/decision-notice";
import { FailedMessageActions } from "@/components/case-chat/failed-message-actions";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";
import { ASSISTANT_LABEL, UPDATING_DECISION, USER_LABEL } from "@/lib/shared/strings/chat";

export function ChatMessage({
  message,
  time,
  failed = false,
  onRetry,
}: {
  message: CaseUIMessage;
  time: string;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const isUser = message.role === "user";
  const decisionShown = message.parts.some(
    (part) =>
      part.type === "data-decision" ||
      (part.type === "tool-updateDecision" && part.state === "output-available" && part.output.accepted),
  );

  const content = message.parts.map((part, index) => {
    if (part.type === "text") {
      // Assistant markdown: no raw HTML and no images. User text is never markdown.
      return isUser ? (
        <p key={index} className="whitespace-pre-wrap">
          {part.text}
        </p>
      ) : (
        <MessageResponse key={index} skipHtml disallowedElements={["img"]}>
          {part.text}
        </MessageResponse>
      );
    }
    if (part.type === "data-decision") {
      return <DecisionBlock key={index} variant="initial" decision={part.data} />;
    }
    if (part.type === "tool-updateDecision") {
      if (part.state === "output-available" && part.output.accepted) {
        return <DecisionBlock key={index} variant="updated" decision={part.output.decision} />;
      }
      if (part.state === "input-streaming" || part.state === "input-available") {
        return <Shimmer key={index}>{UPDATING_DECISION}</Shimmer>;
      }
    }
    return null;
  });

  return (
    <div data-testid="chat-message" data-role={message.role} className="flex w-full flex-col gap-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">{isUser ? USER_LABEL : ASSISTANT_LABEL}</span>
        <time>{time}</time>
      </div>
      <Message from={message.role}>
        <MessageContent>
          {content}
          {decisionShown ? <DecisionNotice /> : null}
        </MessageContent>
      </Message>
      {failed && isUser ? <FailedMessageActions onRetry={onRetry} /> : null}
    </div>
  );
}
