import { describe, expect, it } from "vitest";
import { CATEGORIES, OUTCOMES, REMEDIES } from "@/lib/shared/schemas/enums";
import {
  AI_FORM_NOTICE,
  API_ERROR_MESSAGES,
  CATEGORY_LABELS,
  DECISION_NOTICE,
  fieldErrorMessage,
  OUTCOME_LABELS,
  REMEDY_LABELS,
} from "@/lib/shared/strings/common";

// Exact Polish texts come from the PRD and ADR-001 §4 / ADR-002 §4.1, §5.6.
describe("labels", () => {
  it("lists the 8 categories in the AC-03 order with Polish labels", () => {
    expect(CATEGORIES.map((c) => CATEGORY_LABELS[c])).toEqual([
      "Smartfon",
      "Laptop",
      "Tablet",
      "Telewizor",
      "Słuchawki / audio",
      "Smartwatch / urządzenie ubieralne",
      "Aparat fotograficzny",
      "Małe AGD",
    ]);
  });

  it("has the AC-20 outcome labels", () => {
    expect(OUTCOMES.map((o) => OUTCOME_LABELS[o])).toEqual([
      "Wstępnie zaakceptowano",
      "Wstępnie odrzucono",
      "Wymaga weryfikacji przez serwis",
    ]);
  });

  it("has a label for every remedy", () => {
    for (const r of REMEDIES) expect(REMEDY_LABELS[r].length).toBeGreaterThan(3);
    expect(REMEDY_LABELS.REDUCED_REFUND).toBe("Zwrot pomniejszony o utratę wartości (kwotę ustali serwis)");
  });
});

describe("notices", () => {
  it("has the exact AC-41 and AC-42 texts", () => {
    expect(DECISION_NOTICE).toBe(
      "To wstępna, automatyczna ocena przygotowana przez asystenta AI. Ostateczną decyzję podejmuje serwis po sprawdzeniu urządzenia. Ocena nie ogranicza Twoich praw wynikających z przepisów.",
    );
    expect(AI_FORM_NOTICE).toBe(
      "Wstępną ocenę przygotuje asystent AI. Zrób zdjęcie samego urządzenia — bez osób i danych osobowych.",
    );
  });
});

describe("error messages", () => {
  it("maps field error codes to the PRD texts, per field", () => {
    expect(fieldErrorMessage("caseType", "REQUIRED")).toBe("Wybierz rodzaj zgłoszenia");
    expect(fieldErrorMessage("category", "REQUIRED")).toBe("Wybierz kategorię sprzętu");
    expect(fieldErrorMessage("modelName", "MODEL_NAME")).toBe("Podaj nazwę lub model urządzenia");
    expect(fieldErrorMessage("purchaseDate", "PURCHASE_DATE")).toBe("Podaj prawidłową datę zakupu");
    expect(fieldErrorMessage("description", "DESCRIPTION_MIN")).toBe("Opisz usterkę (min. 20 znaków)");
    expect(fieldErrorMessage("image", "FILE_TOO_LARGE")).toBe("Plik przekracza limit 10 MB");
    expect(fieldErrorMessage("image", "UNSUPPORTED_IMAGE")).toBe("Dozwolone formaty: JPG, PNG, WEBP");
  });

  it("uses the PRD §4.6 text for AI failures", () => {
    const failure = "Nie udało się przygotować decyzji. Spróbuj ponownie za chwilę.";
    expect(API_ERROR_MESSAGES.AI_UNAVAILABLE).toBe(failure);
    expect(API_ERROR_MESSAGES.AI_TIMEOUT).toBe(failure);
    expect(API_ERROR_MESSAGES.CASE_NOT_FOUND).toBe("Sesja wygasła. Rozpocznij nową sprawę.");
  });
});
