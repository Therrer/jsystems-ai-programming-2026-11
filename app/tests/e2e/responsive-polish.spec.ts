import { expect, test, type Page } from "@playwright/test";
import { COMPLAINT_DESCRIPTION, dateDaysAgo, fillCaseForm, imagePath, submitAndWaitForDecision } from "./helpers/case-flow";

// PRD AC-44 (no horizontal scroll at phone and desktop widths), AC-43 (Polish UI text only).
const ENGLISH_UI_TEXT = /Submit|Send|Loading|Error/;

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
}

async function expectNoEnglishUiText(page: Page): Promise<void> {
  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toMatch(ENGLISH_UI_TEXT);
}

test("the case form fits a 360 px phone and a 1920 px desktop without horizontal scroll", async ({ page }) => {
  for (const viewport of [
    { width: 360, height: 740 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expectNoHorizontalScroll(page);
    await expectNoEnglishUiText(page);
  }
});

test("a real case at 360 px keeps the chat screen free of horizontal scroll and English UI text", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await fillCaseForm(page, {
    caseType: "Reklamacja",
    category: "Smartfon",
    modelName: "Xiaomi Redmi Note 11",
    purchaseDate: dateDaysAgo(400),
    description: COMPLAINT_DESCRIPTION,
    image: imagePath("phone-1.jpg"),
  });

  await submitAndWaitForDecision(page);

  await expectNoHorizontalScroll(page);
  await expectNoEnglishUiText(page);
});
