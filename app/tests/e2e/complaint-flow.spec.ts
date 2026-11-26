import { expect, test } from "@playwright/test";
import { DECISION_NOTICE } from "@/lib/shared/strings/common";
import {
  COMPLAINT_DESCRIPTION,
  dateDaysAgo,
  fillCaseForm,
  imagePath,
  sendChat,
  submitAndWaitForDecision,
} from "./helpers/case-flow";

// PRD §4.2 complaint flow. Outcome is not asserted: only its structure.
test.setTimeout(240_000);

test("complaint case produces a structured decision and answers a follow-up question", async ({ page }) => {
  await page.goto("/");
  await fillCaseForm(page, {
    caseType: "Reklamacja",
    category: "Smartfon",
    modelName: "Xiaomi Redmi Note 11",
    purchaseDate: dateDaysAgo(400),
    description: COMPLAINT_DESCRIPTION,
    image: imagePath("phone-1.jpg"),
  });

  const block = await submitAndWaitForDecision(page);

  await expect(block).toHaveAttribute("data-outcome", /^(ACCEPT|REJECT|MANUAL_REVIEW)$/);
  await expect(block).toContainText(/Podstawa: C-\d+\.\d+/);
  await expect(page.getByText(DECISION_NOTICE)).toBeVisible();

  const { response, message } = await sendChat(page, "Co mam zrobić dalej?");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/event-stream");
  await expect(message).not.toBeEmpty();
});
