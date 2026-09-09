import { notFound } from "next/navigation";
import { confirmSandboxCheckoutAction } from "../../../../../lib/actions";
import { isDemoSlug } from "../../../../../lib/demos";

export const dynamic = "force-dynamic";

/**
 * sandbox-checkout epic: the page createSandboxPaymentAdapter's
 * createPaymentSession() redirects a shopper to (packages/payments/src/
 * sandbox-adapter.ts) instead of a real hosted Stripe Checkout page --
 * deliberately styled as its own distinct "payment terminal" look, not
 * themed per the active demo bundle, the same way a real hosted Checkout
 * page never inherits the merchant's own site theme either. Every value
 * rendered here (total/currency/item count/successUrl/cancelUrl) arrives
 * via the URL query string that adapter itself built -- this page never
 * re-derives them from cart/catalog state, so it renders exactly the order
 * the sandbox session was actually created for.
 */
export default async function SandboxCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ demoSlug: string }>;
  searchParams: Promise<{
    session?: string;
    total?: string;
    currency?: string;
    items?: string;
    success?: string;
    cancel?: string;
  }>;
}) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();

  const { session, total, currency, items, success, cancel } = await searchParams;
  if (!session || !total || !currency || !success || !cancel) notFound();

  const amount = (Number(total) / 100).toFixed(2);
  const itemCount = Number(items ?? 1);

  return (
    <main className="sbx-page">
      <style>{SANDBOX_CSS}</style>
      <div className="sbx-card">
        <div className="sbx-badge">Sandbox Checkout &middot; Demo Mode</div>
        <p className="sbx-disclosure">
          This is a demo checkout. No real payment is ever processed, no card is ever charged, and no data
          leaves this server -- Mercatus Liber's <code>PaymentAdapter</code> interface (packages/payments) is
          simply wired to a working sandbox adapter instead of a real provider for this deployment. Enter any
          card number.
        </p>

        <div className="sbx-summary">
          <span>
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          <span className="sbx-total">
            {amount} {currency}
          </span>
        </div>

        <form className="sbx-card-form">
          <label>
            Card number
            <input type="text" defaultValue="4242 4242 4242 4242" inputMode="numeric" />
          </label>
          <div className="sbx-row">
            <label>
              Expiry
              <input type="text" defaultValue="12 / 34" />
            </label>
            <label>
              CVC
              <input type="text" defaultValue="123" inputMode="numeric" />
            </label>
          </div>
        </form>

        <form action={confirmSandboxCheckoutAction}>
          <input type="hidden" name="demoSlug" value={demoSlug} />
          <input type="hidden" name="session" value={session} />
          <input type="hidden" name="successUrl" value={success} />
          <button type="submit" className="sbx-pay">
            Pay {amount} {currency}
          </button>
        </form>

        <a className="sbx-cancel" href={cancel}>
          Cancel and return to cart
        </a>
      </div>
    </main>
  );
}

const SANDBOX_CSS = `
  .sbx-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f1115;
    padding: 24px;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  .sbx-card {
    width: 100%;
    max-width: 420px;
    background: #fff;
    border-radius: 14px;
    padding: 28px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  }
  .sbx-badge {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #7c3aed;
    background: #f3e8ff;
    padding: 4px 10px;
    border-radius: 999px;
    margin-bottom: 14px;
  }
  .sbx-disclosure {
    font-size: 0.82rem;
    color: #52525b;
    line-height: 1.5;
    margin: 0 0 20px;
  }
  .sbx-disclosure code {
    background: #f4f4f5;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 0.78rem;
  }
  .sbx-summary {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-bottom: 16px;
    margin-bottom: 20px;
    border-bottom: 1px solid #e4e4e7;
    color: #18181b;
  }
  .sbx-total {
    font-size: 1.4rem;
    font-weight: 700;
  }
  .sbx-card-form { margin-bottom: 20px; }
  .sbx-card-form label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: #3f3f46;
    margin-bottom: 12px;
  }
  .sbx-card-form input {
    display: block;
    width: 100%;
    margin-top: 5px;
    padding: 10px 12px;
    border: 1px solid #d4d4d8;
    border-radius: 8px;
    font-size: 0.95rem;
    box-sizing: border-box;
  }
  .sbx-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .sbx-pay {
    width: 100%;
    padding: 13px;
    border: none;
    border-radius: 9px;
    background: #18181b;
    color: #fff;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }
  .sbx-pay:hover { background: #27272a; }
  .sbx-cancel {
    display: block;
    text-align: center;
    margin-top: 14px;
    font-size: 0.85rem;
    color: #71717a;
    text-decoration: none;
  }
  .sbx-cancel:hover { text-decoration: underline; }
`;
