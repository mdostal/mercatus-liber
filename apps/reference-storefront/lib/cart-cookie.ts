import { cookies } from "next/headers";
import type { DemoSlug } from "./demos";
import { getServicesForDemo } from "./services";

const CART_COOKIE_PREFIX = "ml_cart_id";

/**
 * demo-routing-04: the cookie NAME itself is namespaced by demo, not just
 * its stored value -- see design-discussion.md §2. Two demos' cart
 * repositories are genuinely separate in-memory state, so a shared cookie
 * name would let a cart id minted for one demo get read back against the
 * other demo's (unrelated) cart repository the moment a shopper browses
 * both demos in the same browser -- a real, silent cross-demo data-bleed
 * bug, not a cosmetic one.
 */
function cartCookieName(demoSlug: DemoSlug): string {
  return `${CART_COOKIE_PREFIX}__${demoSlug}`;
}

/** Read-only -- safe to call from a Server Component render. Returns null if no cart cookie is set yet for this demo. */
export async function readCartId(demoSlug: DemoSlug): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(cartCookieName(demoSlug))?.value ?? null;
}

/**
 * Reads the cart id, creating a new cart and setting the cookie if none exists.
 * Next.js only allows setting cookies inside a Server Action or Route Handler --
 * callers must be one of those, never a plain page render.
 */
export async function getOrCreateCartId(demoSlug: DemoSlug): Promise<string> {
  const existing = await readCartId(demoSlug);
  if (existing) return existing;

  const { cart } = await getServicesForDemo(demoSlug);
  const created = await cart.createCart();
  const cookieStore = await cookies();
  cookieStore.set(cartCookieName(demoSlug), created.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return created.id;
}
