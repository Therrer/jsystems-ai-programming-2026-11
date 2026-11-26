import { getCaseService } from "@/server/cases/service";
import { getCaseStore } from "@/server/cases/store";
import { createCasesHandlers } from "@/server/http/cases";
import { guarded } from "@/server/http/respond";

// POST /api/cases/{caseId}/decision (ADR-002 §5.2). Returns the first message of the decided case.
export async function POST(req: Request, ctx: RouteContext<"/api/cases/[caseId]/decision">) {
  return guarded(() => createCasesHandlers({ service: getCaseService(), store: getCaseStore() }).decide(req, ctx));
}
