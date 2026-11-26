import "server-only";

import { toErrorResponse } from "@/server/errors";
import type { AppEnv } from "@/server/env";
import type { Policy } from "@/server/policies";

// GET /api/health (TAC-002): rule counts, the decisions switch and model ids. Never secrets.
export interface HealthDeps {
  env: AppEnv;
  policies: { return: Policy; complaint: Policy };
}

export function createHealthHandler(deps: HealthDeps): () => Promise<Response> {
  const body = {
    status: "ok" as const,
    policies: {
      return: deps.policies.return.ruleIds.size,
      complaint: deps.policies.complaint.ruleIds.size,
    },
    decisionsEnabled: deps.env.DECISIONS_ENABLED,
    models: {
      vision: deps.env.VISION_MODEL,
      decision: deps.env.DECISION_MODEL,
      chat: deps.env.CHAT_MODEL,
      decisions: deps.env.DECISIONS_MODEL,
    },
  };
  return async () => Response.json(body);
}

// The route passes a loader, so an invalid env becomes a 500 INTERNAL response instead of a crash.
export function createLazyHealthHandler(load: () => HealthDeps): () => Promise<Response> {
  return async () => {
    try {
      return await createHealthHandler(load())();
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      return Response.json(body, { status });
    }
  };
}
