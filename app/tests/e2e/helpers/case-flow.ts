import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { addDays, todayInWarsaw } from "@/lib/shared/dates";

// Real example photos and documents live at the repository root (assets/, docs/).
// This file sits in app/tests/e2e/helpers, so the repository root is four levels up.
const REPO_ROOT = path.resolve(__dirname, "../../../..");

/** Absolute path of a real test photo from assets/example-images (ADR-000 test-image rules). */
export function imagePath(name: "laptop-1.png" | "laptop-2.webp" | "phone-1.jpg" | "phone-2.jpeg" | "phone-3.jpeg"): string {
  return path.resolve(REPO_ROOT, "assets/example-images", name);
}

/** A real non-image file from the repository, used for the unsupported-format test. */
export function unsupportedFilePath(): string {
  return path.resolve(REPO_ROOT, "docs/PRD.md");
}

/** ISO date (YYYY-MM-DD) N calendar days before today in Europe/Warsaw. */
export function dateDaysAgo(n: number): string {
  return addDays(todayInWarsaw(), -n);
}

/** PRD §4.2 complaint description, 40+ characters. */
export const COMPLAINT_DESCRIPTION =
  "Ekran telefonu pęka samoistnie po kilku dniach od zakupu, bez żadnego upadku.";

export type CaseFormInput = {
  caseType: "Reklamacja" | "Zwrot";
  /** AC-03 label, e.g. "Laptop". */
  category: string;
  modelName: string;
  /** ISO date YYYY-MM-DD. */
  purchaseDate: string;
  description?: string;
  /** Absolute path to a real image file. */
  image: string;
};

/** Fills the case form through its real controls (ADR-003 §3.6 selector contract). */
export async function fillCaseForm(page: Page, input: CaseFormInput): Promise<void> {
  await page.getByRole("radiogroup", { name: "Rodzaj zgłoszenia" }).getByRole("radio", { name: input.caseType, exact: true }).click();
  await page.getByRole("combobox", { name: "Kategoria sprzętu" }).click();
  await page.getByRole("option", { name: input.category, exact: true }).click();
  await page.getByRole("textbox", { name: "Nazwa lub model urządzenia" }).fill(input.modelName);
  await page.getByLabel("Data zakupu").fill(input.purchaseDate);
  if (input.description !== undefined) {
    await page.getByRole("textbox", { name: /^Opis/ }).fill(input.description);
  }
  await page.getByLabel("Zdjęcie urządzenia").setInputFiles(input.image);
}

/**
 * Clicks "Wyślij" and waits for POST /api/cases (201) and POST /api/cases/{id}/decision (200),
 * within 90 s (AC-28). Returns the decision block once it is visible.
 */
export async function submitAndWaitForDecision(page: Page): Promise<Locator> {
  const pathnameOf = (url: string) => new URL(url).pathname;
  const created = page.waitForResponse(
    (r) => r.request().method() === "POST" && pathnameOf(r.url()) === "/api/cases",
    { timeout: 90_000 },
  );
  const decided = page.waitForResponse(
    (r) => r.request().method() === "POST" && /^\/api\/cases\/[^/]+\/decision$/.test(pathnameOf(r.url())),
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Wyślij" }).click();
  const [createdResponse, decidedResponse] = await Promise.all([created, decided]);
  expect(createdResponse.status()).toBe(201);
  expect(decidedResponse.status()).toBe(200);

  const block = page.getByTestId("decision-block");
  await expect(block).toBeVisible({ timeout: 90_000 });
  return block;
}

/**
 * Sends one chat message and waits for POST /api/chat and a new assistant message.
 * Returns the response and the locator of the new assistant message.
 */
export async function sendChat(page: Page, text: string) {
  const assistants = page.locator('[data-testid="chat-message"][data-role="assistant"]');
  const assistantsBefore = await assistants.count();
  const chatResponse = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/chat",
    { timeout: 120_000 },
  );
  await page.getByRole("textbox", { name: "Wiadomość" }).fill(text);
  await page.getByRole("button", { name: "Wyślij" }).click();
  const response = await chatResponse;
  const message = assistants.nth(assistantsBefore);
  await expect(message).toBeVisible({ timeout: 120_000 });
  return { response, message };
}

/** Asserts that the given locators appear in the DOM in exactly this order. */
export async function expectInDomOrder(page: Page, locators: Locator[]): Promise<void> {
  const handles = await Promise.all(locators.map((locator) => locator.elementHandle()));
  const inOrder = await page.evaluate((nodes: (Element | null)[]) => {
    for (let i = 0; i < nodes.length - 1; i++) {
      const current = nodes[i];
      const next = nodes[i + 1];
      if (!current || !next) return false;
      if (!(current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
    }
    return true;
  }, handles);
  expect(inOrder).toBe(true);
}
