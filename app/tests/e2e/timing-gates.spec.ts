import { expect, test } from "@playwright/test";
import { addDays, addMonthsClamped, todayInWarsaw } from "@/lib/shared/dates";
import {
  COMPLAINT_DESCRIPTION,
  dateDaysAgo,
  fillCaseForm,
  imagePath,
  submitAndWaitForDecision,
} from "./helpers/case-flow";

// PRD §4.4, AC-24, AC-25. These outcomes are deterministic: they depend on the purchase date,
// not on what the model sees in the photo.
test.setTimeout(240_000);

test("return 18 days after purchase goes to manual review (R-2.3)", async ({ page }) => {
  await page.goto("/");
  await fillCaseForm(page, {
    caseType: "Zwrot",
    category: "Laptop",
    modelName: "Lenovo ThinkPad E14",
    purchaseDate: dateDaysAgo(18),
    image: imagePath("laptop-2.webp"),
  });

  const block = await submitAndWaitForDecision(page);

  await expect(block).toHaveAttribute("data-outcome", "MANUAL_REVIEW");
  await expect(block).toContainText("R-2.3");
});

test("return 30 days after purchase is rejected (R-2.4)", async ({ page }) => {
  await page.goto("/");
  await fillCaseForm(page, {
    caseType: "Zwrot",
    category: "Laptop",
    modelName: "Lenovo ThinkPad E14",
    purchaseDate: dateDaysAgo(30),
    image: imagePath("laptop-2.webp"),
  });

  const block = await submitAndWaitForDecision(page);

  await expect(block).toHaveAttribute("data-outcome", "REJECT");
  await expect(block).toContainText("R-2.4");
});

test("complaint just inside the 24-month buffer goes to manual review (C-2.4)", async ({ page }) => {
  await page.goto("/");
  const purchaseDate = addDays(addMonthsClamped(todayInWarsaw(), -24), -3);
  await fillCaseForm(page, {
    caseType: "Reklamacja",
    category: "Smartfon",
    modelName: "Xiaomi Redmi Note 11",
    purchaseDate,
    description: COMPLAINT_DESCRIPTION,
    image: imagePath("phone-1.jpg"),
  });

  const block = await submitAndWaitForDecision(page);

  await expect(block).toHaveAttribute("data-outcome", "MANUAL_REVIEW");
  await expect(block).toContainText("C-2.4");
});

test("complaint 30 days beyond 24 months is rejected (C-2.5)", async ({ page }) => {
  await page.goto("/");
  const purchaseDate = addDays(addMonthsClamped(todayInWarsaw(), -24), -30);
  await fillCaseForm(page, {
    caseType: "Reklamacja",
    category: "Smartfon",
    modelName: "Xiaomi Redmi Note 11",
    purchaseDate,
    description: COMPLAINT_DESCRIPTION,
    image: imagePath("phone-1.jpg"),
  });

  const block = await submitAndWaitForDecision(page);

  await expect(block).toHaveAttribute("data-outcome", "REJECT");
  await expect(block).toContainText("C-2.5");
});
