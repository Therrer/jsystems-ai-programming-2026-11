import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatTransport } from "@/lib/client/chat-transport";
import { ApiError } from "@/lib/client/api";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";

const RECORDED = path.resolve(import.meta.dirname, "../../fixtures/recorded");
type Fixture = {
  request: { method: string; url: string };
  response: { status: number; body: unknown; rawText?: string };
};
const fixture = (name: string): Fixture => JSON.parse(readFileSync(path.join(RECORDED, name), "utf8"));

const CASE_ID = "f6218e7f-dd72-43a1-b4e9-55d5b36bef05";

function message(id: string, role: "user" | "assistant", text: string): CaseUIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

const MESSAGES: CaseUIMessage[] = [
  message("m-1", "user", "Pierwsze pytanie"),
  message("m-2", "assistant", "Pierwsza odpowiedź"),
  message("m-3", "user", "Jaki model zgłosiłem?"),
];

async function readAll(stream: ReadableStream<{ type: string; delta?: string }>) {
  const chunks: { type: string; delta?: string }[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createChatTransport", () => {
  it("posts exactly id, the last message and trigger to /api/chat and yields the recorded stream", async () => {
    const recorded = fixture("app-chat-200-stream.json");
    const fetchMock = vi.fn(
      async () =>
        new Response(recorded.response.rawText, {
          status: 200,
          headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const transport = createChatTransport();

    const stream = await transport.sendMessages({
      chatId: CASE_ID,
      trigger: "submit-message",
      messageId: undefined,
      messages: MESSAGES,
      abortSignal: undefined,
    });
    const chunks = await readAll(stream);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/chat");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["id", "message", "trigger"]);
    expect(body.id).toBe(CASE_ID);
    expect(body.trigger).toBe("submit-message");
    const sent = body.message as { id: string; role: string; parts: { text: string }[] };
    expect(sent.id).toBe("m-3");
    expect(sent.role).toBe("user");
    expect(sent.parts[0]?.text).toBe("Jaki model zgłosiłem?");
    expect(chunks.some((chunk) => chunk.type === "text-delta")).toBe(true);
  });

  it("rejects with an ApiError CASE_NOT_FOUND on a recorded 404 chat response", async () => {
    const recorded = fixture("app-chat-404-unknown.json");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(recorded.response.body), {
            status: 404,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const transport = createChatTransport();

    const error = await transport
      .sendMessages({
        chatId: CASE_ID,
        trigger: "submit-message",
        messageId: undefined,
        messages: MESSAGES,
        abortSignal: undefined,
      })
      .then(
        () => null,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("CASE_NOT_FOUND");
    expect((error as ApiError).status).toBe(404);
  });
});
