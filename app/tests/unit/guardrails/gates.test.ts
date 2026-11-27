import { describe, expect, it } from "vitest";
import type { ImageAnalysis } from "@/lib/shared/schemas/ai";
import { evaluateGates } from "@/server/guardrails/gates";

const TODAY = "2026-11-26";

function analysis(overrides: Partial<ImageAnalysis> = {}): ImageAnalysis {
  return {
    imageUsable: true,
    unusableReason: null,
    deviceVisible: true,
    detectedCategory: "laptop",
    categoryMatch: "match",
    damageVisible: false,
    damage: [],
    likelyCause: null,
    signsOfUse: "none",
    resellableAsNew: true,
    observationsPl: "Laptop bez widocznych śladów.",
    lunaVerification: [],
    ...overrides,
  } as ImageAnalysis;
}

function daysAgo(n: number): string {
  const base = Date.UTC(2026, 10, 26);
  return new Date(base - n * 86_400_000).toISOString().slice(0, 10);
}

describe("evaluateGates: gate priority (ADR-001 §3.5)", () => {
  it("timing outside wins over unusable image; both codes are reported in order", () => {
    const result = evaluateGates({
      caseType: "return",
      startDate: daysAgo(30),
      today: TODAY,
      analysis: analysis({ imageUsable: false, unusableReason: "blurry" }),
    });
    expect(result.timing.status).toBe("outside");
    expect(result.forcedOutcome).toBe("REJECT");
    expect(result.requiredRuleIds).toEqual(["R-2.4"]);
    expect(result.reasonCodes[0]).toBe("TIMING_OUTSIDE");
    expect(result.reasonCodes).toContain("IMAGE_UNUSABLE");
    expect(result.reasonCodes).toContain("IMAGE_UNUSABLE:blurry");
    expect(result.reasonCodes).toEqual(["TIMING_OUTSIDE", "IMAGE_UNUSABLE", "IMAGE_UNUSABLE:blurry"]);
  });

  it("timing buffer wins over category mismatch", () => {
    const result = evaluateGates({
      caseType: "return",
      startDate: daysAgo(18),
      today: TODAY,
      analysis: analysis({ categoryMatch: "mismatch", detectedCategory: "smartphone" }),
    });
    expect(result.forcedOutcome).toBe("MANUAL_REVIEW");
    expect(result.requiredRuleIds).toEqual(["R-2.3"]);
    expect(result.reasonCodes).toEqual(["TIMING_BUFFER", "CATEGORY_MISMATCH:smartphone"]);
  });

  it("within, usable and matching device -> no forced outcome and no reason codes", () => {
    const result = evaluateGates({
      caseType: "return",
      startDate: daysAgo(3),
      today: TODAY,
      analysis: analysis(),
    });
    expect(result.forcedOutcome).toBeNull();
    expect(result.requiredRuleIds).toEqual(["R-2.1"]);
    expect(result.reasonCodes).toEqual([]);
    expect(result.timing.status).toBe("within");
  });
});

describe("evaluateGates: individual image gates", () => {
  const within = { caseType: "return" as const, startDate: daysAgo(3), today: TODAY };

  it("device not visible -> MANUAL_REVIEW with IMAGE_UNUSABLE and no reason suffix when reason is null", () => {
    const result = evaluateGates({
      ...within,
      analysis: analysis({ deviceVisible: false, imageUsable: true, unusableReason: null }),
    });
    expect(result.forcedOutcome).toBe("MANUAL_REVIEW");
    expect(result.reasonCodes).toEqual(["IMAGE_UNUSABLE"]);
  });

  it("image unusable with reason too_dark -> IMAGE_UNUSABLE and IMAGE_UNUSABLE:too_dark", () => {
    const result = evaluateGates({
      ...within,
      analysis: analysis({ imageUsable: false, unusableReason: "too_dark" }),
    });
    expect(result.forcedOutcome).toBe("MANUAL_REVIEW");
    expect(result.reasonCodes).toEqual(["IMAGE_UNUSABLE", "IMAGE_UNUSABLE:too_dark"]);
  });

  it("category mismatch -> MANUAL_REVIEW with the detected category in the code", () => {
    const result = evaluateGates({
      ...within,
      analysis: analysis({ categoryMatch: "mismatch", detectedCategory: "tv" }),
    });
    expect(result.forcedOutcome).toBe("MANUAL_REVIEW");
    expect(result.reasonCodes).toEqual(["CATEGORY_MISMATCH:tv"]);
  });

  it("category unsure does not gate", () => {
    const result = evaluateGates({ ...within, analysis: analysis({ categoryMatch: "unsure" }) });
    expect(result.forcedOutcome).toBeNull();
    expect(result.reasonCodes).toEqual([]);
  });

  it("complaint case requires the complaint rule ID", () => {
    const result = evaluateGates({
      caseType: "complaint",
      startDate: "2025-01-10",
      today: TODAY,
      analysis: analysis(),
    });
    expect(result.timing.status).toBe("within");
    expect(result.requiredRuleIds).toEqual(["C-2.1"]);
  });
});
