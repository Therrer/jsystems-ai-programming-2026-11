import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  validateCaseForm,
  validateImageFile,
} from "@/lib/shared/schemas/case-form";

// PRD AC-01–AC-11, ADR-002 §4.1. "today" is injected so the tests do not depend on the clock.
const TODAY = "2026-11-26";
const valid = {
  caseType: "return",
  category: "laptop",
  modelName: "Lenovo ThinkPad E14",
  purchaseDate: "2026-11-21",
  description: "",
};

function errorsOf(input: Record<string, unknown>) {
  const result = validateCaseForm(input, TODAY);
  return result.ok ? {} : result.fieldErrors;
}

describe("validateCaseForm — valid input", () => {
  it("accepts a return without a description and trims text", () => {
    const result = validateCaseForm({ ...valid, modelName: "  Lenovo ThinkPad E14  " }, TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.modelName).toBe("Lenovo ThinkPad E14");
  });

  it("accepts a complaint whose description has exactly 20 characters", () => {
    expect(
      validateCaseForm(
        { ...valid, caseType: "complaint", description: "Ekran miga co minutę" },
        TODAY,
      ).ok,
    ).toBe(true);
  });

  it("accepts the purchase-date bounds 2000-01-01 and today", () => {
    expect(validateCaseForm({ ...valid, purchaseDate: "2000-01-01" }, TODAY).ok).toBe(true);
    expect(validateCaseForm({ ...valid, purchaseDate: TODAY }, TODAY).ok).toBe(true);
  });

  it("treats a missing return description as empty", () => {
    const withoutDescription: Partial<typeof valid> = { ...valid };
    delete withoutDescription.description;
    const result = validateCaseForm(withoutDescription, TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.description).toBe("");
  });
});

describe("validateCaseForm — field errors (AC-02 – AC-07)", () => {
  it("requires a case type and a known category", () => {
    expect(errorsOf({ ...valid, caseType: undefined })).toEqual({ caseType: "REQUIRED" });
    expect(errorsOf({ ...valid, category: "drone" })).toEqual({ category: "REQUIRED" });
  });

  it("rejects a model name that is whitespace, too short or too long (AC-04)", () => {
    expect(errorsOf({ ...valid, modelName: "    " })).toEqual({ modelName: "MODEL_NAME" });
    expect(errorsOf({ ...valid, modelName: " a " })).toEqual({ modelName: "MODEL_NAME" });
    expect(errorsOf({ ...valid, modelName: "x".repeat(101) })).toEqual({ modelName: "MODEL_NAME" });
  });

  it("rejects a future, too early or malformed purchase date (AC-05)", () => {
    expect(errorsOf({ ...valid, purchaseDate: "2026-11-27" })).toEqual({ purchaseDate: "PURCHASE_DATE" });
    expect(errorsOf({ ...valid, purchaseDate: "1999-12-31" })).toEqual({ purchaseDate: "PURCHASE_DATE" });
    expect(errorsOf({ ...valid, purchaseDate: "2026-02-30" })).toEqual({ purchaseDate: "PURCHASE_DATE" });
  });

  it("requires at least 20 characters of description for a complaint (AC-06)", () => {
    expect(
      errorsOf({ ...valid, caseType: "complaint", description: "Ekran miga co minut" }),
    ).toEqual({ description: "DESCRIPTION_MIN" });
  });

  it("counts characters as Unicode code points (an emoji counts as one)", () => {
    const nineteenPlusEmoji = "Ekran miga co minut😡"; // 19 letters + 1 emoji = 20 code points
    expect(
      validateCaseForm({ ...valid, caseType: "complaint", description: nineteenPlusEmoji }, TODAY).ok,
    ).toBe(true);
  });

  it("limits any description to 2000 characters (AC-06, AC-07)", () => {
    expect(errorsOf({ ...valid, description: "x".repeat(2001) })).toEqual({ description: "DESCRIPTION_MAX" });
    expect(validateCaseForm({ ...valid, description: "x".repeat(2000) }, TODAY).ok).toBe(true);
  });

  it("reports every invalid field at once (AC-14)", () => {
    expect(
      errorsOf({
        caseType: "complaint",
        category: undefined,
        modelName: "",
        purchaseDate: "2027-01-01",
        description: "krótko",
      }),
    ).toEqual({
      category: "REQUIRED",
      modelName: "MODEL_NAME",
      purchaseDate: "PURCHASE_DATE",
      description: "DESCRIPTION_MIN",
    });
  });
});

describe("validateImageFile (AC-09 – AC-11)", () => {
  it("accepts JPG, PNG and WEBP up to exactly 10 485 760 bytes", () => {
    expect(MAX_IMAGE_BYTES).toBe(10_485_760);
    expect(validateImageFile({ size: 10_485_760, type: "image/jpeg" })).toBeNull();
    expect(validateImageFile({ size: 1000, type: "image/png" })).toBeNull();
    expect(validateImageFile({ size: 1000, type: "image/webp" })).toBeNull();
  });

  it("rejects a missing, too large or unsupported file", () => {
    expect(validateImageFile(null)).toBe("IMAGE_REQUIRED");
    expect(validateImageFile({ size: 10_485_761, type: "image/jpeg" })).toBe("FILE_TOO_LARGE");
    expect(validateImageFile({ size: 1000, type: "image/heic" })).toBe("UNSUPPORTED_IMAGE");
    expect(validateImageFile({ size: 1000, type: "application/pdf" })).toBe("UNSUPPORTED_IMAGE");
  });
});
