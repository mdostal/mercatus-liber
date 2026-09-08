import { cookies } from "next/headers";
import { getThemeBundle, THEME_BUNDLES, type ThemeBundle } from "@mercatus-liber/theming";

const THEME_COOKIE = "ml_theme";

/**
 * Resolves the active theme bundle for this request from a cookie -- never
 * by mutating the shared/global ThemingService singleton (that would race
 * across concurrent requests picking different themes). A pure lookup
 * against THEME_BUNDLES, safe to call from a layout (which can read
 * cookies, unlike searchParams).
 */
export async function readActiveThemeBundle(): Promise<ThemeBundle> {
  const cookieStore = await cookies();
  const key = cookieStore.get(THEME_COOKIE)?.value;
  return (key && getThemeBundle(key)) || THEME_BUNDLES[0]!;
}

export { THEME_COOKIE };
