import { todayInWarsaw } from "@/lib/shared/dates";
import { getChatAgent } from "@/server/ai/chat";
import { getCaseStore } from "@/server/cases/store";
import { createChatHandler } from "@/server/http/chat";
import { guarded } from "@/server/http/respond";
import { getPolicies } from "@/server/policies";

// POST /api/chat (ADR-002 §5.3). Streams one answer per customer message.
export async function POST(req: Request) {
  return guarded(() =>
    createChatHandler({
      store: getCaseStore(),
      chatAgent: getChatAgent(),
      policies: getPolicies(),
      today: () => todayInWarsaw(),
    })(req),
  );
}
