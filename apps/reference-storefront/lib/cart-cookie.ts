import { cookies } from "next/headers";
import { getServices } from "./services";

const CART_COOKIE = "ml_cart_id";

/** Read-only -- safe to call from a Server Component render. Returns null if no cart cookie is set yet. */
export async function readCartId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CART_COOKIE)?.value ?? null;
}

/**
 * Reads the cart id, creating a new cart and setting the cookie if none exists.
 * Next.js only allows setting cookies inside a Server Action or Route Handler --
 * callers must be one of those, never a plain page render.
 */
export async function getOrCreateCartId(): Promise<string> {
  const existing = await readCartId();
  if (existing) return existing;

  const { cart } = await getServices();
  const created = await cart.createCart();
  const cookieStore = await cookies();
  cookieStore.set(CART_COOKIE, created.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return created.id;
}
