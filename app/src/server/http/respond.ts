import "server-only";

import { toErrorResponse } from "@/server/errors";
import { log } from "@/server/log";

// Wraps a route: errors thrown while building dependencies (getEnv, getCaseService, …) or by the
// handler become the ADR-002 §5.6 error body. The error message never reaches the client.
export async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    log.error("route_failed", { code: body.error.code, error: err instanceof Error ? err.name : "unknown" });
    return Response.json(body, { status });
  }
}
