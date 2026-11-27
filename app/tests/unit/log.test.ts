import { describe, expect, it } from "vitest";
import { createLogger } from "@/server/log";

function capture() {
  const lines: string[] = [];
  const logger = createLogger((line) => lines.push(line));
  const parsed = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, lines, parsed };
}

describe("createLogger", () => {
  it("writes one JSON line with ts, level, event and allowed fields", () => {
    const { logger, lines, parsed } = capture();

    logger.info("case.analysed", { caseId: "c-1", stage: "vision", durationMs: 812, model: "openai/gpt-6-luna", status: 200 });

    expect(lines).toHaveLength(1);
    const [entry] = parsed();
    expect(entry?.level).toBe("info");
    expect(entry?.event).toBe("case.analysed");
    expect(typeof entry?.ts).toBe("string");
    expect(Number.isNaN(Date.parse(String(entry?.ts)))).toBe(false);
    expect(entry?.caseId).toBe("c-1");
    expect(entry?.stage).toBe("vision");
    expect(entry?.durationMs).toBe(812);
    expect(entry?.model).toBe("openai/gpt-6-luna");
    expect(entry?.status).toBe(200);
  });

  it("uses the level of the called method for warn and error", () => {
    const { logger, parsed } = capture();

    logger.warn("ai.retry", { stage: "chat" });
    logger.error("ai.failed", { caseId: "c-2" });

    expect(parsed().map((entry) => entry.level)).toEqual(["warn", "error"]);
  });

  it("drops every forbidden field name silently", () => {
    const { logger, parsed } = capture();
    const forbidden = {
      description: "synthetic",
      text: "synthetic",
      content: "synthetic",
      prompt: "synthetic",
      message: "synthetic",
      messages: "synthetic",
      dataUrl: "synthetic",
      image: "synthetic",
      bytes: 4,
      headers: "synthetic",
      authorization: "synthetic",
      apiKey: "synthetic",
    };

    logger.info("case.test", { ...forbidden, caseId: "c-3" });

    const [entry] = parsed();
    for (const name of Object.keys(forbidden)) {
      expect(name in (entry ?? {}), `field ${name} should be dropped`).toBe(false);
    }
    expect(entry?.caseId).toBe("c-3");
  });

  it("replaces a data:image value with [redacted]", () => {
    const { logger, parsed } = capture();

    logger.info("case.test", { stage: "data:image/webp;base64,AAAA" });

    expect(parsed()[0]?.stage).toBe("[redacted]");
  });

  it("replaces an OpenRouter key value with [redacted]", () => {
    const { logger, parsed } = capture();

    logger.error("ai.config", { model: "key sk-or-v1-abc in value" });

    expect(parsed()[0]?.model).toBe("[redacted]");
  });

  it("writes to stdout through console.log by default", () => {
    const original = console.log;
    const seen: unknown[] = [];
    console.log = (...args: unknown[]) => {
      seen.push(...args);
    };
    try {
      createLogger().info("case.default", { caseId: "c-4" });
    } finally {
      console.log = original;
    }

    expect(seen).toHaveLength(1);
    expect(JSON.parse(String(seen[0])).event).toBe("case.default");
  });
});
