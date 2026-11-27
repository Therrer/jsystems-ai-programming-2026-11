import { describe, expect, it } from "vitest";
import { containsMoneyAmount } from "@/server/guardrails/money";

describe("containsMoneyAmount", () => {
  it.each([
    "zwrot 1299 zł",
    "1 299,00 PLN",
    "kwota 50 złotych",
    "€ 30",
    "30€",
    "Zwrot 1.299,50 EUR",
    "Cena: 299 ZŁ",
    "pln 12",
    "EUR12",
  ])("detects a money amount in %j", (text) => {
    expect(containsMoneyAmount(text)).toBe(true);
  });

  it.each([
    "R-2.1",
    "14 dni",
    "C-2.4 i 7 dni",
    "Wymiana na nowy",
    "",
    "Laptop bez widocznych śladów użytkowania.",
  ])("does not flag %j", (text) => {
    expect(containsMoneyAmount(text)).toBe(false);
  });
});
