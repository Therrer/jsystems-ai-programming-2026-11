import "server-only";

// ADR-001 §3.5 rule 7: a number with a currency, or a currency followed by a number.
// Digits may contain spaces, dots or commas; currency words are matched case-insensitively
// and must not continue into a longer word (for example "eurocentów").
const NUMBER = String.raw`\d+(?:[ .,]\d+)*`;
const CURRENCY_AFTER = String.raw`(?:złotych|zł|pln|eur|€)(?!\p{L})`;
const CURRENCY_BEFORE = String.raw`(?<!\p{L})(?:pln|eur|€)`;

const MONEY = new RegExp(
  String.raw`(?:${NUMBER}\s*${CURRENCY_AFTER})|(?:${CURRENCY_BEFORE}\s*${NUMBER})`,
  "iu",
);

export function containsMoneyAmount(text: string): boolean {
  return MONEY.test(text);
}
