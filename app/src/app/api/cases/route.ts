import { getCaseService } from "@/server/cases/service";
import { getCaseStore } from "@/server/cases/store";
import { createCasesHandlers } from "@/server/http/cases";
import { guarded } from "@/server/http/respond";

// POST /api/cases (ADR-002 §5.1). Node.js runtime (the default); dynamic because it reads the request.
// No `runtime`/`dynamic` exports: next.config.ts enables cacheComponents, which rejects them.
export async function POST(req: Request) {
  return guarded(() => createCasesHandlers({ service: getCaseService(), store: getCaseStore() }).create(req));
}
