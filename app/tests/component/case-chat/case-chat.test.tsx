import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CaseChat, type CaseChatProps } from "@/components/case-chat/case-chat";
import type { FormValues } from "@/lib/client/case-flow";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";
import { CHAT_MESSAGE_MAX } from "@/lib/shared/schemas/api";
import { NEW_CASE_BUTTON, MESSAGE_FIELD, SEND_BUTTON, FAILED_MESSAGE, RETRY_BUTTON } from "@/lib/shared/strings/chat";
import { API_ERROR_MESSAGES, DECISION_NOTICE } from "@/lib/shared/strings/common";

const RECORDED = path.resolve(import.meta.dirname, "../../fixtures/recorded");
type Fixture = { request: { method: string; url: string }; response: { status: number; body: unknown; rawText?: string } };
const fixture = (name: string): Fixture => JSON.parse(readFileSync(path.join(RECORDED, name), "utf8"));

const DECISION_200 = fixture("app-decision-200.json");
const CHAT_200 = fixture("app-chat-200-stream.json");
const CHAT_404 = fixture("app-chat-404-unknown.json");
const AI_FAILURE_502 = fixture("app-cases-502-invalid-key.json");
// Derived: the real 502 AI_UNAVAILABLE recording (app-cases-502-invalid-key.json) served on the chat route.
// Only the endpoint differs from the recording; status and body are kept.
const CHAT_502: Fixture = { request: { method: "POST", url: "/api/chat" }, response: AI_FAILURE_502.response };

const CASE_ID = "f6218e7f-dd72-43a1-b4e9-55d5b36bef05";
const FIRST_MESSAGE = (DECISION_200.response.body as { message: CaseUIMessage }).message;
const VALUES: FormValues = {
  caseType: "return",
  category: "laptop",
  modelName: "Lenovo ThinkPad E14",
  purchaseDate: "2026-11-21",
  description: "",
};
const ANSWER = "Zgłosiłeś laptop Lenovo ThinkPad E14.";

function respond(recorded: Fixture): Response {
  if (recorded.response.rawText !== undefined) {
    return new Response(recorded.response.rawText, {
      status: recorded.response.status,
      headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
    });
  }
  return new Response(JSON.stringify(recorded.response.body), {
    status: recorded.response.status,
    headers: { "content-type": "application/json" },
  });
}

/** Answers the n-th request with the n-th recording; the last recording repeats after that. */
function stubChat(...responses: Fixture[]) {
  let index = 0;
  const mock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(async () => {
    const recorded = responses[Math.min(index, responses.length - 1)] as Fixture;
    index += 1;
    return respond(recorded);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function renderChat(overrides: Partial<CaseChatProps> = {}) {
  const props: CaseChatProps = {
    caseId: CASE_ID,
    values: VALUES,
    previewUrl: null,
    firstMessage: FIRST_MESSAGE,
    expired: false,
    onSessionExpired: vi.fn(),
    onNewCase: vi.fn(),
    ...overrides,
  };
  const view = render(<CaseChat {...props} />);
  return { ...view, props };
}

const chatInput = () => screen.getByRole("textbox", { name: MESSAGE_FIELD }) as HTMLTextAreaElement;
const sendButton = () => screen.getByRole("button", { name: SEND_BUTTON }) as HTMLButtonElement;
const chatBodies = (mock: ReturnType<typeof stubChat>) =>
  mock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

beforeAll(() => {
  // The chat scroll container needs ResizeObserver, which jsdom does not implement.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview-1");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CaseChat: first message", () => {
  it("renders the recorded decision with its notice and the HH:MM time in Warsaw", () => {
    renderChat();

    const message = screen.getByTestId("chat-message");
    expect(message.getAttribute("data-role")).toBe("assistant");
    expect(message.textContent).toContain("Przeanalizowałem Twoje zgłoszenie");
    expect(message.querySelector("time")?.textContent).toBe("13:28");
    expect(screen.getByTestId("decision-block").getAttribute("data-outcome")).toBe("ACCEPT");
    expect(screen.getByRole("note").textContent).toBe(DECISION_NOTICE);
  });
});

describe("CaseChat: sending messages", () => {
  it("posts the question once to /api/chat with trigger submit-message and streams the answer", async () => {
    const user = userEvent.setup();
    const mock = stubChat(CHAT_200);
    renderChat();

    await user.type(chatInput(), "Jaki model zgłosiłem?{Enter}");

    await waitFor(() => {
      const assistant = screen.getAllByTestId("chat-message").filter((node) => node.getAttribute("data-role") === "assistant");
      expect(assistant.at(-1)?.textContent).toContain(ANSWER);
    });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(String(mock.mock.calls[0]?.[0])).toBe("/api/chat");
    const body = chatBodies(mock)[0] as Record<string, unknown>;
    expect(body.trigger).toBe("submit-message");
    expect(body.id).toBe(CASE_ID);
    const sent = body.message as { role: string; parts: { text: string }[] };
    expect(sent.role).toBe("user");
    expect(sent.parts[0]?.text).toBe("Jaki model zgłosiłem?");
  });

  it("disables sending for whitespace-only input", async () => {
    const user = userEvent.setup();
    renderChat();

    await user.type(chatInput(), "   ");

    expect(sendButton().disabled).toBe(true);
  });

  it("counts code points: 2000 emoji can be sent, 2001 cannot", () => {
    renderChat();

    fireEvent.change(chatInput(), { target: { value: "😀".repeat(CHAT_MESSAGE_MAX) } });
    expect(sendButton().disabled).toBe(false);

    fireEvent.change(chatInput(), { target: { value: "😀".repeat(CHAT_MESSAGE_MAX + 1) } });
    expect(sendButton().disabled).toBe(true);
  });

  it("shows the n / 2000 counter once the text is above 1800 code points", () => {
    renderChat();

    fireEvent.change(chatInput(), { target: { value: "a".repeat(1800) } });
    expect(screen.queryByText("1800 / 2000")).toBeNull();

    fireEvent.change(chatInput(), { target: { value: "a".repeat(1801) } });
    expect(screen.getByText("1801 / 2000")).toBeTruthy();
  });
});

describe("CaseChat: failures", () => {
  it("marks the question as not sent on a chat 502 and resends the same message on Ponów", async () => {
    const user = userEvent.setup();
    const mock = stubChat(CHAT_502, CHAT_200);
    renderChat();

    await user.type(chatInput(), "Jaki model zgłosiłem?{Enter}");
    expect(await screen.findByText(FAILED_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: RETRY_BUTTON })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: RETRY_BUTTON }));

    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
    const [first, second] = chatBodies(mock) as [Record<string, unknown>, Record<string, unknown>];
    expect(second.trigger).toBe("regenerate-message");
    expect((second.message as { id: string }).id).toBe((first.message as { id: string }).id);
    await waitFor(() => expect(screen.getByText(ANSWER, { exact: false })).toBeTruthy());
  });

  it("calls onSessionExpired on a chat 404 and renders the expired alert with the input disabled", async () => {
    const user = userEvent.setup();
    stubChat(CHAT_404);
    const { rerender, props } = renderChat();

    await user.type(chatInput(), "Jaki model zgłosiłem?{Enter}");
    await waitFor(() => expect(props.onSessionExpired).toHaveBeenCalledTimes(1));

    rerender(<CaseChat {...props} expired />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(API_ERROR_MESSAGES.CASE_NOT_FOUND);
    expect(chatInput().disabled).toBe(true);
    expect(sendButton().disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: NEW_CASE_BUTTON }));
    expect(props.onNewCase).toHaveBeenCalledTimes(1);
  });
});
