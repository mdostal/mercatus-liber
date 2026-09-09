import { cookies } from "next/headers";
import type { DemoSlug } from "./demos";
import { getServicesForDemo } from "./services";

const CUSTOMER_COOKIE_PREFIX = "ml_customer_id";

/** demo-routing-04: namespaced by demo for the same reason as cart-cookie.ts's cartCookieName -- see design-discussion.md §2. */
function customerCookieName(demoSlug: DemoSlug): string {
  return `${CUSTOMER_COOKIE_PREFIX}__${demoSlug}`;
}

/**
 * Demo-only customer identity -- NOT real auth. Auth (login/session/password)
 * is explicitly out of scope for the account subsystem's reference
 * implementation (see acct-01's design decision); this mirrors cart-cookie.ts's
 * pattern so the demo has *a* stable customerId to attach orders/activity to.
 */
export async function readCustomerId(demoSlug: DemoSlug): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(customerCookieName(demoSlug))?.value ?? null;
}

/** Reads the customer id, creating a demo profile + cookie if none exists. Server Action / Route Handler only (sets a cookie). */
export async function getOrCreateCustomerId(demoSlug: DemoSlug): Promise<string> {
  const existing = await readCustomerId(demoSlug);
  if (existing) return existing;

  const { account } = await getServicesForDemo(demoSlug);
  const profile = await account.createProfile({
    email: `demo-${Date.now()}@example.com`,
    name: "Demo Shopper",
  });
  const cookieStore = await cookies();
  cookieStore.set(customerCookieName(demoSlug), profile.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return profile.id;
}
