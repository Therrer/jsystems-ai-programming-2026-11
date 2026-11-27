import { describe, expect, it } from "vitest";
import { EnvError } from "@/server/env";
import { guarded } from "@/server/http/respond";

// Orchestrator fix at T20 acceptance: building the route dependencies (getEnv, getCaseService…) can
// throw before a handler runs. Those errors must still become the ADR-002 §5.6 error body.
describe("guarded", () => {
  it("returns the handler's response when nothing throws", async () => {
    const res = await guarded(async () => new Response(null, { status: 204 }));
    expect(res.status).toBe(204);
  });

  it("turns an error thrown while building dependencies into 500 INTERNAL without the message", async () => {
    const res = await guarded(async () => {
      throw new EnvError(["OPENROUTER_API_KEY"]);
    });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe("INTERNAL");
    expect(text).not.toContain("OPENROUTER_API_KEY");
  });
});
