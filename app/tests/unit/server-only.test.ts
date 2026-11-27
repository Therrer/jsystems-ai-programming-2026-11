import { describe, expect, it } from "vitest";

// ADR-000 TAC-05: every src/server module imports "server-only". Tests must be able to import them.
describe("server-only in tests", () => {
  it("resolves to the package's react-server export instead of throwing", async () => {
    await expect(import("server-only")).resolves.toBeDefined();
  });
});
