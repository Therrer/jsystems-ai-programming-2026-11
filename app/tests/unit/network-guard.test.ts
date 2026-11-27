import { describe, expect, it } from "vitest";

describe("network guard (ADR-000 TAC-02)", () => {
  it("blocks requests to OpenRouter", async () => {
    await expect(fetch("https://openrouter.ai/api/v1/models")).rejects.toThrow(
      "Network access blocked in tests: openrouter.ai",
    );
  });

  it("blocks requests to any other external host", async () => {
    await expect(fetch("https://example.com/")).rejects.toThrow(
      "Network access blocked in tests: example.com",
    );
  });
});
