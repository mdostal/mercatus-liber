import { cookies } from "next/headers";
import { getThemeBundle, THEME_BUNDLES, type ThemeBundle } from "@mercatus-liber/theming";
import type { DemoSlug } from "./demos";

const THEME_COOKIE_PREFIX = "ml_theme";

/** demo-routing-04: namespaced by demo for the same reason as cart-cookie.ts's cartCookieName -- see design-discussion.md §2. Exported (not just used internally) so lib/actions.ts's setThemeAction can write the same namespaced name this module reads. */
export function themeCookieName(demoSlug: DemoSlug): string {
  return `${THEME_COOKIE_PREFIX}__${demoSlug}`;
}

/**
 * Resolves the active theme bundle for this request from a cookie -- never
 * by mutating the shared/global ThemingService singleton (that would race
 * across concurrent requests picking different themes). A pure lookup
 * against THEME_BUNDLES, safe to call from a layout (which can read
 * cookies, unlike searchParams).
 */
export async function readActiveThemeBundle(demoSlug: DemoSlug): Promise<ThemeBundle> {
  const cookieStore = await cookies();
  const key = cookieStore.get(themeCookieName(demoSlug))?.value;
  return (key && getThemeBundle(key)) || THEME_BUNDLES[0]!;
}
