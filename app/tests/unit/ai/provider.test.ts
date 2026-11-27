import fs from "node:fs";
import path from "node:path";
import { generateText } from "ai";
import { describe, expect, it } from "vitest";
import { createAiProvider } from "@/server/ai/provider";
import { parseEnv, type AppEnv } from "@/server/env";

const FAKE_KEY = "test-key-not-real";
const CWD = path.resolve("/repo/app");
const RECORDED_DIR = path.resolve(import.meta.dirname, "../../fixtures/recorded");

interface RecordedCapture {
  request: { body: Record<string, unknown> };
  response: { status: number; body: Record<string, unknown> };
}

// Every mocked response is the body of a real recorded capture (plan §4, capture policy).
function readRecorded(name: string): RecordedCapture {
  return JSON.parse(fs.readFileSync(path.join(RECORDED_DIR, name), "utf8")) as RecordedCapture;
}

function recordedMessageContent(capture: RecordedCapture): string {
  const choices = capture.response.body.choices as Array<{ message: { content: string } }>;
  const content = choices[0]?.message.content;
  if (content === undefined) throw new Error("recorded capture has no message content");
  return content;
}

function testEnv(overrides: Record<string, string> = {}): AppEnv {
  return parseEnv(
    {
      OPENROUTER_API_KEY: FAKE_KEY,
      LLM_MODEL: "openai/gpt-6-luna",
      DECISIONS_MODEL: "openai/gpt-6-luna-decisions",
      ...overrides,
    },
    CWD,
  );
}

interface CapturedRequest {
  url: string;
  authorization: string | null;
  body: Record<string, unknown>;
}

// Injected fetch: records the outgoing request and answers with the recorded body.
// No test reaches the network (TAC-02).
function recordingFetch(status: number, body: unknown) {
  const captured: CapturedRequest[] = [];
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    captured.push({
      url,
      authorization: new Headers(init?.headers).get("authorization"),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetch: fetchStub, captured };
}

function providerPrefs(request: CapturedRequest): Record<string, unknown> {
  return request.body.provider as Record<string, unknown>;
}

describe("createAiProvider chat models", () => {
  const vision = readRecorded("vision-structured-return-laptop.json");
  const decision = readRecorded("decision-structured-return.json");

  it("sends vision requests with privacy settings, usage accounting and require_parameters", async () => {
    const env = testEnv({ VISION_MODEL: "openai/gpt-6-luna" });
    const { fetch, captured } = recordingFetch(vision.response.status, vision.response.body);
    const provider = createAiProvider(env, { fetch });

    const result = await generateText({ model: provider.model("vision"), prompt: "x" });

    expect(captured).toHaveLength(1);
    const request = captured[0]!;
    expect(request.url.endsWith("/chat/completions")).toBe(true);
    expect(request.body.model).toBe(env.VISION_MODEL);
    expect(providerPrefs(request).data_collection).toBe("deny");
    expect(providerPrefs(request).zdr).toBe(true);
    expect(providerPrefs(request).require_parameters).toBe(true);
    expect((request.body.usage as { include?: unknown }).include).toBe(true);
    expect(request.authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(result.text).toBe(recordedMessageContent(vision));
  });

  it("sends decision requests with require_parameters enabled", async () => {
    const env = testEnv({ DECISION_MODEL: "openai/gpt-6-luna" });
    const { fetch, captured } = recordingFetch(decision.response.status, decision.response.body);
    const provider = createAiProvider(env, { fetch });

    const result = await generateText({ model: provider.model("decision"), prompt: "x" });

    expect(captured).toHaveLength(1);
    const request = captured[0]!;
    expect(request.url.endsWith("/chat/completions")).toBe(true);
    expect(request.body.model).toBe(env.DECISION_MODEL);
    expect(providerPrefs(request).data_collection).toBe("deny");
    expect(providerPrefs(request).zdr).toBe(true);
    expect(providerPrefs(request).require_parameters).toBe(true);
    expect((request.body.usage as { include?: unknown }).include).toBe(true);
    expect(result.text).toBe(recordedMessageContent(decision));
  });

  it("sends chat requests with privacy settings but without require_parameters", async () => {
    const env = testEnv({ CHAT_MODEL: "openai/gpt-6-luna-chat" });
    const { fetch, captured } = recordingFetch(vision.response.status, vision.response.body);
    const provider = createAiProvider(env, { fetch });

    await generateText({ model: provider.model("chat"), prompt: "x" });

    expect(captured).toHaveLength(1);
    const request = captured[0]!;
    expect(request.body.model).toBe(env.CHAT_MODEL);
    expect(providerPrefs(request).data_collection).toBe("deny");
    expect(providerPrefs(request).zdr).toBe(true);
    expect(providerPrefs(request).require_parameters).not.toBe(true);
    expect((request.body.usage as { include?: unknown }).include).toBe(true);
  });
});

describe("createAiProvider Decisions requests (Luna)", () => {
  const luna = readRecorded("luna-decisions-return-laptop.json");
  // The recorded request: its state holds a text item and an image item (image data redacted
  // in the fixture as a file reference), its questions use the Decisions shapes directly.
  const recordedBody = luna.request.body as { state: unknown[]; questions: Record<string, unknown> };
  const state = recordedBody.state.map((item) =>
    typeof item === "string" ? item : { type: "image_url" as const, image_url: { url: "data:image/webp;base64,AAAA" } },
  );

  it("posts to the Decisions endpoint with the model, privacy settings and auth", async () => {
    const env = testEnv();
    const { fetch, captured } = recordingFetch(luna.response.status, luna.response.body);
    const provider = createAiProvider(env, { fetch });

    const response = await provider.decisions({ state, questions: recordedBody.questions });

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    const request = captured[0]!;
    expect(request.url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(request.body.model).toBe(env.DECISIONS_MODEL);
    expect(providerPrefs(request).data_collection).toBe("deny");
    expect(providerPrefs(request).zdr).toBe(true);
    expect(request.authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(Object.keys(request.body.questions as object).sort()).toEqual(Object.keys(recordedBody.questions).sort());
    const sentState = request.body.state as Array<string | { type: string }>;
    expect(sentState.length).toBe(2);
    expect(typeof sentState[1] === "object" ? sentState[1].type : "").toBe("image_url");
  });

  it("keeps the privacy settings even if the caller passes its own provider or model", async () => {
    const env = testEnv();
    const { fetch, captured } = recordingFetch(luna.response.status, luna.response.body);
    const provider = createAiProvider(env, { fetch });
    const sneaky = { state, questions: recordedBody.questions, provider: { data_collection: "allow" }, model: "other/model" };

    await provider.decisions(sneaky as unknown as Parameters<typeof provider.decisions>[0]);

    const request = captured[0]!;
    expect(providerPrefs(request).data_collection).toBe("deny");
    expect(providerPrefs(request).zdr).toBe(true);
    expect(request.body.model).toBe(env.DECISIONS_MODEL);
  });

  it("returns the recorded answers, including the category choice", async () => {
    const { fetch } = recordingFetch(luna.response.status, luna.response.body);
    const provider = createAiProvider(testEnv(), { fetch });

    const response = await provider.decisions({ state, questions: recordedBody.questions });
    const body = (await response.json()) as { answers: Record<string, { type: string; choice?: string }> };

    expect(body.answers.category?.type).toBe("choice");
    expect(body.answers.category?.choice).toBe("laptop");
  });
});
