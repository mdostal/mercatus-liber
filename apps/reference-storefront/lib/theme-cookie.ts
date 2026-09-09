import { cookies } from "next/headers";
import { getThemeBundle, THEME_BUNDLES, type ThemeBundle } from "@mercatus-liber/theming";
import { DEMO_REGISTRY, type DemoSlug } from "./demos";

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
 *
 * Fallback chain (design-discussion.md §1c): an explicit cookie always wins
 * (a visitor who manually switched themes keeps their choice) -- only when
 * there's no cookie at all does this fall back to the demo's own configured
 * `defaultThemeKey` (DEMO_REGISTRY[demoSlug].defaultThemeKey, via
 * getThemeBundle), and only when THAT is absent/unknown does it fall back to
 * THEME_BUNDLES[0] ("classic"), same as before this fallback existed.
 */
export async function readActiveThemeBundle(demoSlug: DemoSlug): Promise<ThemeBundle> {
  const cookieStore = await cookies();
  const key = cookieStore.get(themeCookieName(demoSlug))?.value;
  if (key) {
    const cookieBundle = getThemeBundle(key);
    if (cookieBundle) return cookieBundle;
  }

  const defaultThemeKey = DEMO_REGISTRY[demoSlug].defaultThemeKey;
  const defaultBundle = defaultThemeKey && getThemeBundle(defaultThemeKey);
  return defaultBundle || THEME_BUNDLES[0]!;
}
