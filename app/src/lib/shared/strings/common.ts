// Shared Polish UI and server strings (TAC-003-03). Form-only and chat-only strings live in
// form.ts (T12) and chat.ts (T13). Exact texts come from the PRD and ADR-001 §4, ADR-002 §4.1, §5.6.
import type { CaseFormField, ImageField } from "../schemas/case-form";
import type { ApiErrorCode, CaseType, Category, FieldErrorCode, Outcome, Remedy } from "../schemas/enums";

export const PRODUCT_NAME = "Hardware Service Decision Copilot";
export const COMPANY_NAME = "Example Electronics Store";

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  complaint: "Reklamacja",
  return: "Zwrot",
};

/** PRD AC-03. */
export const CATEGORY_LABELS: Record<Category, string> = {
  smartphone: "Smartfon",
  laptop: "Laptop",
  tablet: "Tablet",
  tv: "Telewizor",
  audio: "Słuchawki / audio",
  wearable: "Smartwatch / urządzenie ubieralne",
  camera: "Aparat fotograficzny",
  small_appliance: "Małe AGD",
};

/** PRD AC-20. */
export const OUTCOME_LABELS: Record<Outcome, string> = {
  ACCEPT: "Wstępnie zaakceptowano",
  REJECT: "Wstępnie odrzucono",
  MANUAL_REVIEW: "Wymaga weryfikacji przez serwis",
};

/** ADR-001 §4. */
export const REMEDY_LABELS: Record<Remedy, string> = {
  FULL_REFUND: "Pełny zwrot pieniędzy",
  REDUCED_REFUND: "Zwrot pomniejszony o utratę wartości (kwotę ustali serwis)",
  REPAIR: "Naprawa",
  REPLACEMENT: "Wymiana na nowy",
  PRICE_REDUCTION_OR_REFUND: "Obniżenie ceny lub zwrot pieniędzy",
  PAID_REPAIR: "Płatna naprawa po wycenie",
};

/** PRD AC-41 — appended by the UI to every decision message. */
export const DECISION_NOTICE =
  "To wstępna, automatyczna ocena przygotowana przez asystenta AI. Ostateczną decyzję podejmuje serwis po sprawdzeniu urządzenia. Ocena nie ogranicza Twoich praw wynikających z przepisów.";

/** PRD AC-42 — shown above the submit button. */
export const AI_FORM_NOTICE =
  "Wstępną ocenę przygotuje asystent AI. Zrób zdjęcie samego urządzenia — bez osób i danych osobowych.";

const REQUIRED_BY_FIELD: Record<CaseFormField | ImageField, string> = {
  caseType: "Wybierz rodzaj zgłoszenia",
  category: "Wybierz kategorię sprzętu",
  modelName: "Podaj nazwę lub model urządzenia",
  purchaseDate: "Podaj prawidłową datę zakupu",
  description: "Opisz usterkę (min. 20 znaków)",
  image: "Dodaj zdjęcie urządzenia",
};

/** ADR-002 §4.1 field error texts. */
const FIELD_ERROR_TEXT: Record<Exclude<FieldErrorCode, "REQUIRED">, string> = {
  MODEL_NAME: "Podaj nazwę lub model urządzenia",
  PURCHASE_DATE: "Podaj prawidłową datę zakupu",
  DESCRIPTION_MIN: "Opisz usterkę (min. 20 znaków)",
  DESCRIPTION_MAX: "Opis może mieć maks. 2000 znaków",
  IMAGE_REQUIRED: "Dodaj zdjęcie urządzenia",
  FILE_TOO_LARGE: "Plik przekracza limit 10 MB",
  UNSUPPORTED_IMAGE: "Dozwolone formaty: JPG, PNG, WEBP",
  IMAGE_UNREADABLE: "Nie udało się odczytać zdjęcia. Wybierz inny plik.",
};

export function fieldErrorMessage(field: CaseFormField | ImageField, code: FieldErrorCode): string {
  return code === "REQUIRED" ? REQUIRED_BY_FIELD[field] : FIELD_ERROR_TEXT[code];
}

const AI_FAILURE = "Nie udało się przygotować decyzji. Spróbuj ponownie za chwilę."; // PRD §4.6

/** ADR-002 §5.6. Texts for CASE_NOT_READY, ATTACHMENTS_NOT_ALLOWED, MESSAGE_LENGTH and DUPLICATE_MESSAGE are not in the ADR and were written here. */
export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: "Popraw zaznaczone pola.",
  FILE_TOO_LARGE: FIELD_ERROR_TEXT.FILE_TOO_LARGE,
  UNSUPPORTED_IMAGE: FIELD_ERROR_TEXT.UNSUPPORTED_IMAGE,
  IMAGE_UNREADABLE: FIELD_ERROR_TEXT.IMAGE_UNREADABLE,
  CASE_NOT_FOUND: "Sesja wygasła. Rozpocznij nową sprawę.",
  CASE_BUSY: "Poczekaj na zakończenie poprzedniej odpowiedzi.",
  CASE_NOT_READY: "Decyzja nie jest jeszcze gotowa. Spróbuj ponownie za chwilę.",
  CHAT_LIMIT: "Osiągnięto limit wiadomości w tej sprawie. Rozpocznij nową sprawę.",
  ATTACHMENTS_NOT_ALLOWED: "Czat nie przyjmuje załączników.",
  MESSAGE_LENGTH: "Wiadomość musi mieć od 1 do 2000 znaków.",
  DUPLICATE_MESSAGE: "Ta wiadomość została już wysłana.",
  AI_UNAVAILABLE: AI_FAILURE,
  AI_TIMEOUT: AI_FAILURE,
  INTERNAL: AI_FAILURE,
};

/** Shown in a chat stream error part (ADR-002 §5.3). */
export const CHAT_ERROR_MESSAGE = "Nie udało się uzyskać odpowiedzi. Spróbuj ponownie.";
