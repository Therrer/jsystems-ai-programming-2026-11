import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CaseApp } from "@/components/case-app";
import { API_ERROR_MESSAGES } from "@/lib/shared/strings/common";
import { CATEGORY_LABEL, MODEL_NAME_LABEL, FORM_TITLE, SUBMIT_BUTTON } from "@/lib/shared/strings/form";
import { DECISION_NOTICE } from "@/lib/shared/strings/common";
import { CASE_SUMMARY_LABEL, NEW_CASE_BUTTON } from "@/lib/shared/strings/chat";

// Real example photos only (assets/example-images). Fixtures: real T21 recordings (tests/fixtures/recorded).
const IMAGES = path.resolve(import.meta.dirname, "../../../assets/example-images");
const RECORDED = path.resolve(import.meta.dirname, "../fixtures/recorded");
type Fixture = { request: { method: string; url: string }; response: { status: number; body: unknown } };
const fixture = (name: string): Fixture => JSON.parse(readFileSync(path.join(RECORDED, name), "utf8"));

const CASES_201 = fixture("app-cases-201.json");
const CASES_400 = fixture("app-cases-400-validation.json");
const DECISION_200 = fixture("app-decision-200.json");
const DELETE_204 = fixture("app-delete-204.json");
const CASE_ID = (CASES_201.response.body as { caseId: string }).caseId;
const DECISION_URL = `/api/cases/${CASE_ID}/decision`;
const DELETE_URL = `/api/cases/${CASE_ID}`;
const AI_FAILURE_502 = fixture("app-cases-502-invalid-key.json");
// Derived: the real 502 AI_UNAVAILABLE recording (app-cases-502-invalid-key.json) served on the decision route.
// Only the endpoint differs from the recording; status and body are kept.
const DECISION_502: Fixture = { request: { method: "POST", url: DECISION_URL }, response: AI_FAILURE_502.response };

function respond(recorded: Fixture): Response {
  if (recorded.response.body === null) return new Response(null, { status: recorded.response.status });
  return new Response(JSON.stringify(recorded.response.body), {
    status: recorded.response.status,
    headers: { "content-type": "application/json" },
  });
}

type Handler = (init: RequestInit) => Response | Promise<Response>;

/** Routes the three endpoints of the flow; any other request fails the test. */
function stubApi(handlers: { cases?: Handler; decision?: Handler } = {}) {
  const mock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const request = init ?? {};
    if (method === "POST" && url === "/api/cases") return (handlers.cases ?? (() => respond(CASES_201)))(request);
    if (method === "POST" && url === DECISION_URL) return (handlers.decision ?? (() => respond(DECISION_200)))(request);
    if (method === "DELETE" && url === DELETE_URL) return respond(DELETE_204);
    throw new Error(`unexpected request ${method} ${url}`);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function calls(mock: ReturnType<typeof stubApi>): string[] {
  return mock.mock.calls.map(([input, init]) => `${init?.method ?? "GET"} ${String(input)}`);
}

async function pickCategory(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("combobox", { name: CATEGORY_LABEL }));
  await user.click(await screen.findByRole("option", { name: label }));
}

/** A valid return with a real example photo (the decision fixture was recorded for the same laptop). */
async function fillValidReturn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Zwrot" }));
  await pickCategory(user, "Laptop");
  await user.type(screen.getByRole("textbox", { name: MODEL_NAME_LABEL }), "Lenovo ThinkPad E14");
  await user.type(screen.getByLabelText("Data zakupu"), "2026-11-21");
  await user.upload(
    screen.getByLabelText("Zdjęcie urządzenia"),
    new File([Uint8Array.from(readFileSync(path.join(IMAGES, "laptop-2.webp")))], "laptop-2.webp", {
      type: "image/webp",
    }),
  );
}

async function submitValidReturn(user: ReturnType<typeof userEvent.setup>) {
  await fillValidReturn(user);
  await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON }));
}

async function reachChat(user: ReturnType<typeof userEvent.setup>) {
  await submitValidReturn(user);
  await screen.findByTestId("decision-block");
}

beforeAll(() => {
  // Radix Select and the chat scroll container need these DOM APIs, which jsdom does not implement.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  let urlCounter = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${++urlCounter}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CaseApp: happy path", () => {
  it("creates the case, requests the decision and shows the chat screen", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi();
    render(<CaseApp />);

    await submitValidReturn(user);

    const message = await screen.findByTestId("chat-message");
    expect(message.getAttribute("data-role")).toBe("assistant");
    expect(screen.getByTestId("decision-block").getAttribute("data-outcome")).toBe("ACCEPT");
    expect(screen.getByRole("note").textContent).toBe(DECISION_NOTICE);
    expect(screen.getByRole("region", { name: CASE_SUMMARY_LABEL })).toBeTruthy();
    expect(screen.getByRole("button", { name: NEW_CASE_BUTTON })).toBeTruthy();
    expect(calls(fetchMock)).toEqual(["POST /api/cases", `POST ${DECISION_URL}`]);
  });
});

describe("CaseApp: failures", () => {
  it("returns a 400 validation response to the form with the field error and no banner", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({ cases: () => respond(CASES_400) });
    render(<CaseApp />);

    await submitValidReturn(user);

    const modelName = await screen.findByRole("textbox", { name: MODEL_NAME_LABEL });
    const describedBy = modelName.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe("Podaj nazwę lub model urządzenia");
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).toBeNull();
    expect(calls(fetchMock)).toEqual(["POST /api/cases"]);
  });

  it("shows the AI banner on a decision 502, keeps the values, and retries only the decision step", async () => {
    const user = userEvent.setup();
    let decisionCalls = 0;
    const fetchMock = stubApi({
      decision: () => {
        decisionCalls += 1;
        return respond(decisionCalls === 1 ? DECISION_502 : DECISION_200);
      },
    });
    render(<CaseApp />);

    await submitValidReturn(user);

    expect(await screen.findByText(API_ERROR_MESSAGES.AI_UNAVAILABLE)).toBeTruthy();
    expect((screen.getByRole("textbox", { name: MODEL_NAME_LABEL }) as HTMLInputElement).value).toBe(
      "Lenovo ThinkPad E14",
    );

    await user.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    await screen.findByTestId("decision-block");
    expect(calls(fetchMock)).toEqual(["POST /api/cases", `POST ${DECISION_URL}`, `POST ${DECISION_URL}`]);
  });

  it("deletes the case left by a failed decision step once the customer edits the form and resubmits (T27 F5)", async () => {
    const user = userEvent.setup();
    let decisionCalls = 0;
    const fetchMock = stubApi({
      decision: () => {
        decisionCalls += 1;
        return respond(decisionCalls === 1 ? DECISION_502 : DECISION_200);
      },
    });
    render(<CaseApp />);

    await submitValidReturn(user);
    expect(await screen.findByText(API_ERROR_MESSAGES.AI_UNAVAILABLE)).toBeTruthy();

    await user.type(screen.getByRole("textbox", { name: MODEL_NAME_LABEL }), " Gen 5");
    await waitFor(() => expect(calls(fetchMock)).toContain(`DELETE ${DELETE_URL}`));

    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON }));
    await screen.findByTestId("decision-block");
    expect(calls(fetchMock)).toEqual([
      "POST /api/cases",
      `POST ${DECISION_URL}`,
      `DELETE ${DELETE_URL}`,
      "POST /api/cases",
      `POST ${DECISION_URL}`,
    ]);
  });

  it("aborts a request that runs past 90 seconds and shows the AI timeout banner", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubApi({
      cases: (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    });
    render(<CaseApp />);

    await fillValidReturn(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON }));
    await vi.advanceTimersByTimeAsync(90_000);

    expect(await screen.findByText(API_ERROR_MESSAGES.AI_TIMEOUT)).toBeTruthy();
  });
});

describe("CaseApp: new case", () => {
  it("keeps the chat when the new-case dialog is cancelled", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi();
    render(<CaseApp />);
    await reachChat(user);

    await user.click(screen.getByRole("button", { name: NEW_CASE_BUTTON }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Anuluj" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByTestId("decision-block")).toBeTruthy();
    expect(calls(fetchMock).some((entry) => entry.startsWith("DELETE"))).toBe(false);
  });

  it("deletes the case, revokes the preview and shows an empty form after confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi();
    render(<CaseApp />);
    await reachChat(user);

    await user.click(screen.getByRole("button", { name: NEW_CASE_BUTTON }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: NEW_CASE_BUTTON }));

    expect(await screen.findByRole("heading", { level: 1, name: FORM_TITLE })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: MODEL_NAME_LABEL }) as HTMLInputElement).value).toBe("");
    await waitFor(() => expect(calls(fetchMock)).toContain(`DELETE ${DELETE_URL}`));
    const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(deleteCall?.[1]?.keepalive).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(vi.mocked(URL.createObjectURL).mock.results[0]?.value);
  });
});
