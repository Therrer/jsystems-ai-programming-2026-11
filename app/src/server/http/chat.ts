import "server-only";

import { CHAT_MESSAGE_MAX, CHAT_USER_MESSAGE_LIMIT, chatRequestSchema, type CaseUIMessage } from "@/lib/shared/schemas/api";
import { codePointLength } from "@/lib/shared/schemas/case-form";
import type { ChatAgent } from "@/server/ai/chat";
import type { CaseStore } from "@/server/cases/store";
import {
  AttachmentsNotAllowedError,
  CaseBusyError,
  CaseNotFoundError,
  CaseNotReadyError,
  ChatLimitError,
  DuplicateMessageError,
  MessageLengthError,
  ValidationError,
  toErrorResponse,
} from "@/server/errors";
import type { Policy } from "@/server/policies";

// POST /api/chat (ADR-002 §5.3, TD-203). Only id, message and trigger are read from the body.
export interface ChatHandlerDeps {
  store: CaseStore;
  chatAgent: ChatAgent;
  policies: { return: Policy; complaint: Policy };
  today: () => string;
}

type RequestMessage = { id: string; parts: Array<{ type: string } & Record<string, unknown>> };

function failure(err: unknown): Response {
  const { status, body } = toErrorResponse(err);
  return Response.json(body, { status });
}

async function readBody(req: Request): Promise<{ id: string; message: RequestMessage }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ValidationError({});
  }
  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) throw new ValidationError({});
  // A text part must carry string text (T27 F2): a malformed part would be stored and replayed into
  // every later turn. Non-text parts are rejected later as ATTACHMENTS_NOT_ALLOWED (AC-36).
  if (parsed.data.message.parts.some((part) => part.type === "text" && typeof part.text !== "string")) {
    throw new ValidationError({});
  }
  return { id: parsed.data.id, message: parsed.data.message };
}

// Text of all parts, joined; a part without a string text counts as empty.
function textOf(parts: RequestMessage["parts"]): string {
  return parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("");
}

export function createChatHandler(deps: ChatHandlerDeps): (req: Request) => Promise<Response> {
  const { store, chatAgent, policies, today } = deps;

  // Runs once the lock is held. The agent's callbacks release the lock on finish or error. If a client
  // aborts and the agent calls neither, the lock expires after lockStaleMs (known limitation).
  async function startTurn(req: Request, id: string, message: RequestMessage): Promise<Response> {
    const current = store.get(id);
    if (!current) throw new CaseNotFoundError();

    // A retry resends the same id after a failed turn: the stored message is reused, not appended again.
    const last = current.messages.at(-1);
    let userMessage: CaseUIMessage;
    if (last !== undefined && last.id === message.id && last.role === "user") {
      userMessage = last;
    } else {
      if (current.messages.some((m) => m.id === message.id)) throw new DuplicateMessageError();
      if (current.userMessageCount >= CHAT_USER_MESSAGE_LIMIT) throw new ChatLimitError();
      userMessage = {
        id: message.id,
        role: "user",
        // Only type and text are kept: extra client fields never reach the stored history (T27 F2).
        parts: message.parts.map((part) => ({ type: "text" as const, text: String(part.text) })),
        metadata: { createdAt: new Date().toISOString() },
      };
      store.update(id, (c) => {
        c.messages.push(userMessage);
        c.userMessageCount += 1;
      });
    }

    const snapshot = store.get(id);
    if (!snapshot) throw new CaseNotFoundError();
    // The agent appends newMessage itself, so the history it receives excludes this message.
    const chatCase = { ...snapshot, messages: snapshot.messages.filter((m) => m.id !== userMessage.id) };

    return chatAgent.stream({
      chatCase,
      newMessage: userMessage,
      policy: policies[snapshot.form.caseType],
      today: today(),
      signal: req.signal,
      recordDecision: (decision) => {
        store.update(id, (c) => {
          c.decisions.push(decision);
        });
      },
      onFinish: (messages) => {
        store.update(id, (c) => {
          c.messages = messages;
        });
        store.unlock(id);
      },
      onError: () => {
        store.unlock(id);
      },
    });
  }

  return async (req) => {
    try {
      const { id, message } = await readBody(req);

      const stored = store.get(id);
      if (!stored) throw new CaseNotFoundError();
      if (stored.status !== "decided") throw new CaseNotReadyError();

      if (message.parts.some((part) => part.type !== "text")) throw new AttachmentsNotAllowedError();
      const length = codePointLength(textOf(message.parts).trim());
      if (length < 1 || length > CHAT_MESSAGE_MAX) throw new MessageLengthError();

      if (!store.tryLock(id)) throw new CaseBusyError();
      try {
        return await startTurn(req, id, message);
      } catch (err) {
        store.unlock(id);
        throw err;
      }
    } catch (err) {
      return failure(err);
    }
  };
}
