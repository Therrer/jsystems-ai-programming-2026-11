import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  isIsoDate,
  todayInWarsaw,
} from "@/lib/shared/dates";

// ADR-001 §3.4: "today" is the calendar date in Europe/Warsaw; month addition clamps to month end.
describe("todayInWarsaw", () => {
  it("uses the Warsaw calendar date, not UTC (winter, UTC+1)", () => {
    expect(todayInWarsaw(new Date("2026-11-25T23:30:00Z"))).toBe("2026-11-26");
    expect(todayInWarsaw(new Date("2026-11-25T22:59:00Z"))).toBe("2026-11-25");
  });

  it("uses the Warsaw calendar date in summer (UTC+2)", () => {
    expect(todayInWarsaw(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
  });
});

describe("isIsoDate", () => {
  it("accepts real calendar dates in YYYY-MM-DD form", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-11-26")).toBe(true);
  });

  it("rejects impossible dates and other formats", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26.11.2026")).toBe(false);
    expect(isIsoDate("2026-11-26T10:00:00Z")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("daysBetween", () => {
  it("counts calendar days from the first to the second date", () => {
    expect(daysBetween("2026-11-21", "2026-11-26")).toBe(5);
    expect(daysBetween("2026-11-26", "2026-11-26")).toBe(0);
    expect(daysBetween("2026-11-27", "2026-11-26")).toBe(-1);
  });

  it("is not shifted by daylight-saving changes", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("addMonthsClamped and addDays", () => {
  it("adds calendar months", () => {
    expect(addMonthsClamped("2024-11-25", 24)).toBe("2026-11-25");
  });

  it("clamps to the end of a shorter month", () => {
    expect(addMonthsClamped("2024-02-29", 24)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});
