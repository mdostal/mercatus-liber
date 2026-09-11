import { HomeMagazineGrid } from "../components/home-magazine-grid";
import { HomeMaximalistGrid } from "../components/home-maximalist-grid";
import { HomeSpecGrid } from "../components/home-spec-grid";
import { HomeStandardGrid } from "../components/home-standard-grid";

/**
 * storefront-views-and-multi-catalog epic: template-key -> component map,
 * the app-layer half of the theming contract (mirrors products/[slug]/
 * page.tsx's PDP_TEMPLATES map exactly). Extracted out of app/demo/
 * [demoSlug]/page.tsx (which originally defined this map inline) so both
 * that page's active-default-override branch and the new /site/[viewSlug]
 * route can render a StorefrontView through the exact same 4 registered
 * home templates without duplicating this map, or the 4 theme-variant home
 * components themselves. Adding a new registered "home" template still only
 * requires one more entry here.
 */
export const HOME_TEMPLATES = {
  "home.standard-grid": HomeStandardGrid,
  "home.magazine-grid": HomeMagazineGrid,
  "home.spec-grid": HomeSpecGrid,
  "home.maximalist-grid": HomeMaximalistGrid,
} as const;

export { HomeStandardGrid };
