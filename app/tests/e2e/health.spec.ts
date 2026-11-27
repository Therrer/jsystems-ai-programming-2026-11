import { expect, test } from "@playwright/test";

// ADR-002 §5: GET /api/health reports readiness without exposing secrets.
type Health = {
  status: string;
  policies: { return: number; complaint: number };
  decisionsEnabled: boolean;
  models: unknown;
};

test("health endpoint reports a ready service without secrets", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);

  const text = await response.text();
  expect(text).not.toContain("sk-or-");

  const body = JSON.parse(text) as Health;
  expect(body.status).toBe("ok");
  expect(body.policies.return).toBeGreaterThanOrEqual(10);
  expect(body.policies.complaint).toBeGreaterThanOrEqual(10);
  expect(body.decisionsEnabled).toBe(true);
});
