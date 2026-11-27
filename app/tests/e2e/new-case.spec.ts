import { expect, test } from "@playwright/test";
import { dateDaysAgo, fillCaseForm, imagePath, submitAndWaitForDecision } from "./helpers/case-flow";

// PRD §4.7, AC-38, AC-39: "Nowa sprawa" starts a new case; leaving a case with an open chat warns first.
test.setTimeout(240_000);

const returnCase = {
  caseType: "Zwrot" as const,
  category: "Laptop",
  modelName: "Lenovo ThinkPad E14",
  purchaseDate: dateDaysAgo(5),
  image: imagePath("laptop-2.webp"),
};

test("cancelling the new-case dialog keeps the chat; confirming deletes the case and clears the form", async ({ page }) => {
  let caseId: string | undefined;
  page.on("response", async (response) => {
    if (response.request().method() !== "POST" || response.status() !== 201) return;
    if (new URL(response.url()).pathname !== "/api/cases") return;
    try {
      caseId = ((await response.json()) as { caseId: string }).caseId;
    } catch {
      // The body may be unavailable in some states; the assertions below will then fail visibly.
    }
  });

  await page.goto("/");
  await fillCaseForm(page, returnCase);
  const block = await submitAndWaitForDecision(page);

  await page.getByRole("button", { name: "Nowa sprawa" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Rozpocząć nową sprawę? Obecna rozmowa zostanie usunięta.");
  await expect(dialog.getByRole("button", { name: "Anuluj" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Nowa sprawa" })).toBeVisible();

  await dialog.getByRole("button", { name: "Anuluj" }).click();
  await expect(dialog).toBeHidden();
  await expect(block).toBeVisible();

  await page.getByRole("button", { name: "Nowa sprawa" }).click();
  const deleteRequest = page.waitForRequest(
    (request) => request.method() === "DELETE" && /\/api\/cases\/[^/]+$/.test(new URL(request.url()).pathname),
  );
  await page.getByRole("alertdialog").getByRole("button", { name: "Nowa sprawa" }).click();

  const request = await deleteRequest;
  expect(caseId).toBeTruthy();
  expect(new URL(request.url()).pathname).toBe(`/api/cases/${caseId}`);
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Nazwa lub model urządzenia" })).toHaveValue("");
});

test("reloading the page during an open chat warns before leaving and shows the empty form", async ({ page }) => {
  await page.goto("/");
  await fillCaseForm(page, returnCase);
  await submitAndWaitForDecision(page);

  const dialogTypes: string[] = [];
  page.on("dialog", (dialog) => {
    dialogTypes.push(dialog.type());
    void dialog.accept();
  });

  await page.reload();

  expect(dialogTypes).toContain("beforeunload");
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Nazwa lub model urządzenia" })).toHaveValue("");
});
