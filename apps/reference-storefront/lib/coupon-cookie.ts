import { cookies } from "next/headers";
import type { DemoSlug } from "./demos";

const COUPON_COOKIE_PREFIX = "ml_coupon_code";

/** demo-routing-04: namespaced by demo for the same reason as cart-cookie.ts's cartCookieName -- see design-discussion.md §2. */
function couponCookieName(demoSlug: DemoSlug): string {
  return `${COUPON_COOKIE_PREFIX}__${demoSlug}`;
}

/** Read-only -- safe to call from a Server Component render. Returns null if no coupon code has been entered yet for this demo. */
export async function readCouponCode(demoSlug: DemoSlug): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(couponCookieName(demoSlug))?.value ?? null;
}

/**
 * Stores the entered coupon code, or clears it when passed an empty string.
 * Next.js only allows setting cookies inside a Server Action or Route Handler --
 * callers must be one of those, never a plain page render.
 */
export async function setCouponCode(demoSlug: DemoSlug, code: string): Promise<void> {
  const cookieStore = await cookies();
  const name = couponCookieName(demoSlug);
  if (code.length === 0) {
    cookieStore.delete(name);
    return;
  }
  cookieStore.set(name, code, { sameSite: "lax", path: "/" });
}
