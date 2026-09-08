import { cookies } from "next/headers";
import { getServices } from "./services";

const CUSTOMER_COOKIE = "ml_customer_id";

/**
 * Demo-only customer identity -- NOT real auth. Auth (login/session/password)
 * is explicitly out of scope for the account subsystem's reference
 * implementation (see acct-01's design decision); this mirrors cart-cookie.ts's
 * pattern so the demo has *a* stable customerId to attach orders/activity to.
 */
export async function readCustomerId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CUSTOMER_COOKIE)?.value ?? null;
}

/** Reads the customer id, creating a demo profile + cookie if none exists. Server Action / Route Handler only (sets a cookie). */
export async function getOrCreateCustomerId(): Promise<string> {
  const existing = await readCustomerId();
  if (existing) return existing;

  const { account } = await getServices();
  const profile = await account.createProfile({
    email: `demo-${Date.now()}@example.com`,
    name: "Demo Shopper",
  });
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_COOKIE, profile.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return profile.id;
}
