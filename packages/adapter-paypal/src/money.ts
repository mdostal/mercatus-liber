/**
 * Converts this repo's minor-units `Money.amount` (@mercatus-liber/core --
 * "Minor units (e.g. cents) -- never a float") into PayPal's own documented
 * decimal-string `amount.value` shape (e.g. `"19.99"`), confirmed as a real,
 * genuine representational difference from Stripe (which takes minor units
 * directly) -- see paypal-types.ts's research finding 6.
 *
 * PayPal's real currency-codes reference
 * (developer.paypal.com/reference/currency-codes) confirms exactly three
 * zero-decimal currencies, each described verbatim as a "Zero-digit currency
 * — no decimal places or fractions": HUF, JPY, TWD. Every other currency is
 * treated as 2-decimal -- this is PayPal's own documented default for the
 * currencies this adapter has had reason to confirm; it is not a claim that
 * every possible ISO 4217 code is 2-decimal for PayPal (a handful of
 * currencies PayPal does not even support are irrelevant here, and this
 * adapter does not special-case any currency PayPal's own reference did not
 * explicitly name as zero-decimal).
 */
const PAYPAL_ZERO_DECIMAL_CURRENCIES = new Set(["HUF", "JPY", "TWD"]);

export function minorUnitsToPaypalValue(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  if (PAYPAL_ZERO_DECIMAL_CURRENCIES.has(code)) {
    return String(Math.round(amount));
  }
  return (amount / 100).toFixed(2);
}
