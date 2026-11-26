import { expect, test } from "@playwright/test";
import { dateDaysAgo, fillCaseForm, imagePath, submitAndWaitForDecision } from "./helpers/case-flow";

// PRD §4.3, AC-26. The file name says phone, the chosen category says laptop.
// The mismatch makes the outcome deterministic (MANUAL_REVIEW); the wording of the explanation is not.
test.setTimeout(240_000);

test("a phone photo submitted as a laptop is sent to manual review and the reply names the mismatch", async ({ page }) => {
  await page.goto("/");
  await fillCaseForm(page, {
    caseType: "Zwrot",
    category: "Laptop",
    modelName: "Lenovo ThinkPad E14",
    purchaseDate: dateDaysAgo(5),
    image: imagePath("phone-2.jpeg"),
  });

  const block = await submitAndWaitForDecision(page);

  await expect(block).toHaveAttribute("data-outcome", "MANUAL_REVIEW");
  // The first assistant message is the decision message (the decision block lives inside it).
  await expect(page.locator('[data-testid="chat-message"][data-role="assistant"]').first()).toHaveText(/telefon|smartfon/i);
});
