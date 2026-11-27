import "server-only";
import { addDays, addMonthsClamped, daysBetween } from "@/lib/shared/dates";
import type { TimingStatus } from "@/lib/shared/schemas/ai";
import type { CaseType, TimingStatusValue } from "@/lib/shared/schemas/enums";

// ADR-001 §3.4: timing windows. Pure: "today" is always a parameter (no clock).
export function computeTiming({
  caseType,
  startDate,
  today,
}: {
  caseType: CaseType;
  startDate: string;
  today: string;
}): TimingStatus {
  const daysSinceStart = daysBetween(startDate, today);

  if (caseType === "return") {
    const deadline = addDays(startDate, 14);
    const status: TimingStatusValue =
      daysSinceStart <= 14 ? "within" : daysSinceStart <= 21 ? "buffer" : "outside";
    const ruleId = status === "within" ? "R-2.1" : status === "buffer" ? "R-2.3" : "R-2.4";
    return { status, startDate, today, daysSinceStart, deadline, ruleId };
  }

  const deadline = addMonthsClamped(startDate, 24);
  const bufferEnd = addDays(deadline, 7);
  const status: TimingStatusValue = today <= deadline ? "within" : today <= bufferEnd ? "buffer" : "outside";
  const ruleId = status === "within" ? "C-2.1" : status === "buffer" ? "C-2.4" : "C-2.5";
  return { status, startDate, today, daysSinceStart, deadline, ruleId };
}
