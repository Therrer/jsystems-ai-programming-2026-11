import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { costFromProviderMetadata, costFromRawUsage } from "@/server/ai/usage";

// Raw OpenRouter usage objects are copied from the real recordings (plan §4, capture policy).
const RECORDED_DIR = path.resolve(import.meta.dirname, "../../fixtures/recorded");

function recordedUsage(name: string): unknown {
  const capture = JSON.parse(fs.readFileSync(path.join(RECORDED_DIR, name), "utf8")) as {
    exchanges: Array<{ response: { body: { usage?: unknown } } }>;
  };
  return capture.exchanges[0]?.response.body.usage;
}

describe("costFromRawUsage", () => {
  it("reads the upstream inference cost of the recorded vision response", () => {
    expect(costFromRawUsage(recordedUsage("final-vision-return-laptop2.json"))).toBe(0.000551425);
  });

  it("reads the upstream inference cost of the recorded decision response", () => {
    expect(costFromRawUsage(recordedUsage("final-decision-return-laptop2.json"))).toBe(0.000490675);
  });

  it("reads the upstream inference cost of the recorded Luna response", () => {
    expect(costFromRawUsage(recordedUsage("final-luna-return-laptop2.json"))).toBe(0.0001733);
  });

  it("falls back to cost when no upstream cost is present", () => {
    expect(costFromRawUsage({ cost: 0.002 })).toBe(0.002);
  });

  it("returns null when no cost is present", () => {
    expect(costFromRawUsage({})).toBeNull();
    expect(costFromRawUsage(null)).toBeNull();
    expect(costFromRawUsage("x")).toBeNull();
  });
});

describe("costFromProviderMetadata", () => {
  it("reads costDetails.upstreamInferenceCost from the SDK provider metadata", () => {
    expect(
      costFromProviderMetadata({ openrouter: { usage: { promptTokens: 1, costDetails: { upstreamInferenceCost: 0.000551425 } } } }),
    ).toBe(0.000551425);
  });

  it("falls back to cost when no upstream cost is present", () => {
    expect(costFromProviderMetadata({ openrouter: { usage: { cost: 0.002 } } })).toBe(0.002);
  });

  it("returns null when the metadata has no usage", () => {
    expect(costFromProviderMetadata(undefined)).toBeNull();
    expect(costFromProviderMetadata({ openrouter: {} })).toBeNull();
    expect(costFromProviderMetadata({ openrouter: { usage: { promptTokens: 1 } } })).toBeNull();
  });
});
