import { connection } from "next/server";
import { getEnv } from "@/server/env";
import { createHealthHandler } from "@/server/http/health";
import { guarded } from "@/server/http/respond";
import { getPolicies } from "@/server/policies";

// GET /api/health (ADR-002 §5.5). Ids and counts only.
// connection() keeps this route dynamic under cacheComponents, so env is read per request, not at build time.
export async function GET() {
  await connection();
  return guarded(() => createHealthHandler({ env: getEnv(), policies: getPolicies() })());
}
