import { expect, test } from "@playwright/test";
import type { Outcome } from "@/lib/shared/schemas/enums";
import { DECISION_NOTICE, OUTCOME_LABELS } from "@/lib/shared/strings/common";
import {
  dateDaysAgo,
  expectInDomOrder,
  fillCaseForm,
  imagePath,
  sendChat,
  submitAndWaitForDecision,
} from "./helpers/case-flow";

// PRD §4.1 return flow, AC-29, AC-31, AC-34, AC-41. Outcome is not asserted: only its structure.
test.setTimeout(240_000);

test("return case produces a structured decision and answers a follow-up question", async ({ page }) => {
  await page.goto("/");
  await fillCaseForm(page, {
    caseType: "Zwrot",
    category: "Laptop",
    modelName: "Lenovo ThinkPad E14",
    purchaseDate: dateDaysAgo(5),
    image: imagePath("laptop-2.webp"),
  });

  const block = await submitAndWaitForDecision(page);

  await expect(block).toHaveAttribute("data-outcome", /^(ACCEPT|REJECT|MANUAL_REVIEW)$/);
  const outcome = (await block.getAttribute("data-outcome")) as Outcome;
  await expect(block).toContainText(OUTCOME_LABELS[outcome]);
  await expect(block).toContainText(/Podstawa: R-\d+\.\d+/);

  await expectInDomOrder(page, [
    page.getByRole("heading", { name: "Co widzimy na zdjęciu" }),
    page.getByRole("heading", { name: "Uzasadnienie" }),
    page.getByRole("heading", { name: "Kolejne kroki" }),
  ]);
  await expect(page.getByText(DECISION_NOTICE)).toBeVisible();
  await expect(page.getByRole("region", { name: "Szczegóły sprawy" })).toContainText("Lenovo ThinkPad E14");

  const { response, message } = await sendChat(page, "Jaki model zgłosiłem?");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/event-stream");
  await expect(message).toContainText("ThinkPad");
});
