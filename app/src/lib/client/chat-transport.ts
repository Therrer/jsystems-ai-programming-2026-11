// Chat transport for POST /api/chat (ADR-002 §4.3, ADR-003 §3.2). Client code: no server imports.
import { DefaultChatTransport } from "ai";
import { toApiError } from "@/lib/client/api";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";

/** Sends only the case id, the newest message and the trigger; non-2xx responses become ApiError. */
export function createChatTransport(): DefaultChatTransport<CaseUIMessage> {
  return new DefaultChatTransport<CaseUIMessage>({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ id, messages, trigger }) => ({
      body: { id, message: messages.at(-1), trigger },
    }),
    // Looked up at call time so the global fetch can be replaced in tests.
    fetch: async (input, init) => {
      const response = await globalThis.fetch(input, init);
      if (!response.ok) throw await toApiError(response);
      return response;
    },
  });
}
