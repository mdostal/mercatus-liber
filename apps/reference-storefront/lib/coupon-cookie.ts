import { cookies } from "next/headers";

const COUPON_COOKIE = "ml_coupon_code";

/** Read-only -- safe to call from a Server Component render. Returns null if no coupon code has been entered yet. */
export async function readCouponCode(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COUPON_COOKIE)?.value ?? null;
}

/**
 * Stores the entered coupon code, or clears it when passed an empty string.
 * Next.js only allows setting cookies inside a Server Action or Route Handler --
 * callers must be one of those, never a plain page render.
 */
export async function setCouponCode(code: string): Promise<void> {
  const cookieStore = await cookies();
  if (code.length === 0) {
    cookieStore.delete(COUPON_COOKIE);
    return;
  }
  cookieStore.set(COUPON_COOKIE, code, { sameSite: "lax", path: "/" });
}
