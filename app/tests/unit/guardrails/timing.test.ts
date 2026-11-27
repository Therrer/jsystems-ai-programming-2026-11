import { describe, expect, it } from "vitest";
import { computeTiming } from "@/server/guardrails/timing";

const TODAY = "2026-11-26";

function daysAgo(n: number): string {
  // Synthetic fixed-date arithmetic: 2026-11-26 minus n days, computed without the clock.
  const base = Date.UTC(2026, 10, 26);
  return new Date(base - n * 86_400_000).toISOString().slice(0, 10);
}

describe("computeTiming: return window (R-2.x, 14/21/22 days)", () => {
  const cases: Array<{ days: number; status: string; ruleId: string }> = [
    { days: 0, status: "within", ruleId: "R-2.1" },
    { days: 14, status: "within", ruleId: "R-2.1" },
    { days: 15, status: "buffer", ruleId: "R-2.3" },
    { days: 21, status: "buffer", ruleId: "R-2.3" },
    { days: 22, status: "outside", ruleId: "R-2.4" },
  ];

  it.each(cases)("start $days days ago -> $status ($ruleId)", ({ days, status, ruleId }) => {
    const startDate = daysAgo(days);
    const timing = computeTiming({ caseType: "return", startDate, today: TODAY });
    expect(timing).toEqual({
      status,
      startDate,
      today: TODAY,
      daysSinceStart: days,
      deadline: addDaysExpected(startDate, 14),
      ruleId,
    });
  });

  it("counts a start date after today as within (negative days)", () => {
    const timing = computeTiming({ caseType: "return", startDate: "2026-11-30", today: TODAY });
    expect(timing.status).toBe("within");
    expect(timing.daysSinceStart).toBe(-4);
    expect(timing.ruleId).toBe("R-2.1");
  });
});

describe("computeTiming: complaint window (C-2.x, 24 months + 7 day buffer)", () => {
  it.each([
    { today: "2026-11-25", status: "within", ruleId: "C-2.1" },
    { today: "2026-12-02", status: "buffer", ruleId: "C-2.4" },
    { today: "2026-12-03", status: "outside", ruleId: "C-2.5" },
  ])("start 2024-11-25, today $today -> $status ($ruleId)", ({ today, status, ruleId }) => {
    const timing = computeTiming({ caseType: "complaint", startDate: "2024-11-25", today });
    expect(timing.status).toBe(status);
    expect(timing.ruleId).toBe(ruleId);
    expect(timing.deadline).toBe("2026-11-25");
    expect(timing.today).toBe(today);
    expect(timing.startDate).toBe("2024-11-25");
  });
});

describe("computeTiming: leap day clamping", () => {
  it.each([
    { today: "2026-02-28", status: "within", ruleId: "C-2.1" },
    { today: "2026-03-07", status: "buffer", ruleId: "C-2.4" },
    { today: "2026-03-08", status: "outside", ruleId: "C-2.5" },
  ])("start 2024-02-29, today $today -> $status", ({ today, status, ruleId }) => {
    const timing = computeTiming({ caseType: "complaint", startDate: "2024-02-29", today });
    expect(timing.status).toBe(status);
    expect(timing.ruleId).toBe(ruleId);
    expect(timing.deadline).toBe("2026-02-28");
  });
});

// Independent expectation for the return deadline (startDate + 14 days), written without the module under test.
function addDaysExpected(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
