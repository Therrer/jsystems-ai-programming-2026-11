import { getCaseService } from "@/server/cases/service";
import { getCaseStore } from "@/server/cases/store";
import { createCasesHandlers } from "@/server/http/cases";
import { guarded } from "@/server/http/respond";

// DELETE /api/cases/{caseId} (ADR-002 §5.4). Always 204.
export async function DELETE(req: Request, ctx: RouteContext<"/api/cases/[caseId]">) {
  return guarded(() => createCasesHandlers({ service: getCaseService(), store: getCaseStore() }).remove(req, ctx));
}
