import type { LayoutTemplate, ThemeBundle, ThemingService } from "@mercatus-liber/theming";
import { resolvePageTemplateOverride } from "./resolve-page-template";

/**
 * The 5 page types packages/theming/src/service.ts's DEFAULT_TEMPLATES
 * registers real LayoutTemplates for (design-system-v2-01) -- the exact set
 * the content-layout admin dashboard (scc-04) shows one row per. "marketing"/
 * "search"/"location" are real CMS PageTypes (packages/cms/src/types.ts) but
 * have no registered LayoutTemplates of their own today, so they're
 * deliberately not rows here.
 */
export const CONTENT_LAYOUT_PAGE_TYPES: readonly { pageType: string; label: string }[] = [
  { pageType: "nav", label: "Navigation" },
  { pageType: "home", label: "Home" },
  { pageType: "category", label: "Category (PLP)" },
  { pageType: "cart", label: "Cart" },
  { pageType: "pdp", label: "Product detail (PDP)" },
];

export interface ContentLayoutStatusRow {
  pageType: string;
  label: string;
  templates: LayoutTemplate[];
  /** theming.getConfiguredDefault(pageType) -- this dashboard's OWN per-page-type admin pick (setPageTemplateAction, lib/actions.ts), independent of the active whole-bundle theme. Null when this demo has no admin override for this page type yet -- rendering currently follows the active bundle (or the first-registered template) instead. */
  adminOverrideKey: string | null;
  /** The template key ACTUALLY rendered right now for this page type under the active theme bundle -- resolvePageTemplateOverride's exact composition (lib/resolve-page-template.ts), the same one every real page render call site uses. This is what an admin sees live on the storefront, not just what this dashboard has configured. */
  liveTemplateKey: string | null;
  liveTemplateLabel: string | null;
}

/**
 * Mirrors lib/adapter-info.ts's "computed fresh per subsystem, no caching"
 * convention (see that module's own header comment): one row per
 * theming-registered page type, always recomputed from the live
 * ThemingService + active ThemeBundle passed in, never memoized
 * independently of them -- so it's always honest about this demo's current
 * state, including right after a setPageTemplateAction mutation.
 */
export function getContentLayoutStatus(theming: ThemingService, bundle: ThemeBundle): ContentLayoutStatusRow[] {
  return CONTENT_LAYOUT_PAGE_TYPES.map(({ pageType, label }) => {
    const templates = theming.listTemplates(pageType);
    const adminOverrideKey = theming.getConfiguredDefault(pageType);
    const liveTemplateKey = theming.resolveTemplate(pageType, resolvePageTemplateOverride(theming, pageType, bundle));
    const liveTemplateLabel = templates.find((t) => t.key === liveTemplateKey)?.label ?? null;
    return { pageType, label, templates, adminOverrideKey, liveTemplateKey, liveTemplateLabel };
  });
}
