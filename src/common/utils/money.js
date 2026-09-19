// Money is always an integer number of minor units (cents for USD). Floats
// never represent money: 10.005 is not a payable amount, and 0.1 + 0.2 is not
// 0.3. Amounts cross the API boundary as integers in fields suffixed `Cents`,
// are stored as integers, and are handed to Stripe as integers — no scaling,
// rounding or parsing anywhere in between.
//
// Only USD is supported, so the minor unit is always 1/100. Adding a currency
// with a different exponent (JPY has none) means adding a per-currency
// exponent here and in the Stripe adapter.
const SUPPORTED_CURRENCIES = ["usd"];
const MINOR_UNITS_PER_MAJOR = 100;

// $1,000,000,000 — a sanity ceiling, not a business rule: it keeps a typo (or
// an overflow probe) out of Stripe and well inside Number.MAX_SAFE_INTEGER.
const MAX_AMOUNT_CENTS = 100_000_000_000;

function isValidAmount(cents) {
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_AMOUNT_CENTS;
}

// For human-readable text only (notifications, emails) — never for arithmetic.
function format(cents, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
    cents / MINOR_UNITS_PER_MAJOR
  );
}

module.exports = { SUPPORTED_CURRENCIES, MINOR_UNITS_PER_MAJOR, MAX_AMOUNT_CENTS, isValidAmount, format };
