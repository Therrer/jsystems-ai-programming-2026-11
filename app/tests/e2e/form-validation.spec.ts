import { expect, test } from "@playwright/test";
import { AI_FORM_NOTICE, CATEGORY_LABELS, fieldErrorMessage } from "@/lib/shared/strings/common";
import { expectInDomOrder, fillCaseForm, imagePath, unsupportedFilePath, dateDaysAgo } from "./helpers/case-flow";

// PRD AC-01, AC-02, AC-03, AC-06, AC-07, AC-10, AC-14, AC-42.
// AC-11 (file larger than 10 MB) is not covered here: it needs a generated oversized file,
// which the test-image rules forbid. It belongs to component tests.

test.describe("case form validation and layout", () => {
  test("shows the six fields in the PRD order", async ({ page }) => {
    await page.goto("/");

    await expectInDomOrder(page, [
      page.getByRole("radiogroup", { name: "Rodzaj zgłoszenia" }),
      page.getByRole("combobox", { name: "Kategoria sprzętu" }),
      page.getByRole("textbox", { name: "Nazwa lub model urządzenia" }),
      page.getByLabel("Data zakupu"),
      page.getByRole("textbox", { name: /^Opis/ }),
      page.getByLabel("Zdjęcie urządzenia"),
    ]);
  });

  test("starts with no case type selected and lists exactly the 8 AC-03 categories", async ({ page }) => {
    await page.goto("/");

    const caseType = page.getByRole("radiogroup", { name: "Rodzaj zgłoszenia" });
    await expect(caseType.getByRole("radio")).toHaveCount(2);
    await expect(caseType.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);

    await page.getByRole("combobox", { name: "Kategoria sprzętu" }).click();
    await expect(page.getByRole("option")).toHaveText(Object.values(CATEGORY_LABELS));
    await page.keyboard.press("Escape");
  });

  test("changes the description label between return and complaint", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("radiogroup", { name: "Rodzaj zgłoszenia" }).getByRole("radio", { name: "Zwrot", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Opis (opcjonalnie)" })).toBeVisible();

    await page.getByRole("radiogroup", { name: "Rodzaj zgłoszenia" }).getByRole("radio", { name: "Reklamacja", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Opis", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /opcjonalnie/ })).toHaveCount(0);
  });

  test("shows the AI form notice above the submit button", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(AI_FORM_NOTICE)).toBeVisible();
  });

  test("submitting an empty form sends no case request and shows every required-field error", async ({ page }) => {
    await page.goto("/");

    const caseRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/cases") {
        caseRequests.push(request.url());
      }
    });

    await page.getByRole("button", { name: "Wyślij" }).click();

    await expect(page.getByText(fieldErrorMessage("caseType", "REQUIRED"))).toBeVisible();
    await expect(page.getByText(fieldErrorMessage("category", "REQUIRED"))).toBeVisible();
    await expect(page.getByText(fieldErrorMessage("modelName", "REQUIRED"))).toBeVisible();
    await expect(page.getByText(fieldErrorMessage("purchaseDate", "REQUIRED"))).toBeVisible();
    await expect(page.getByText(fieldErrorMessage("image", "REQUIRED"))).toBeVisible();
    expect(caseRequests).toEqual([]);
  });

  test("a complaint with a 19-character description shows the minimum-length error", async ({ page }) => {
    await page.goto("/");

    await fillCaseForm(page, {
      caseType: "Reklamacja",
      category: CATEGORY_LABELS.smartphone,
      modelName: "Xiaomi Redmi Note 11",
      purchaseDate: dateDaysAgo(60),
      description: "a".repeat(19),
      image: imagePath("phone-1.jpg"),
    });
    await page.getByRole("button", { name: "Wyślij" }).click();

    await expect(page.getByText(fieldErrorMessage("description", "DESCRIPTION_MIN"))).toBeVisible();
  });

  test("uploading a non-image file shows the supported-formats error", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Zdjęcie urządzenia").setInputFiles(unsupportedFilePath());

    await expect(page.getByText("Dozwolone formaty: JPG, PNG, WEBP")).toBeVisible();
  });
});
