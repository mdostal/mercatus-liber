import type { LayoutTemplate, StyleTokens, ThemingService } from "./types.js";

/**
 * Default PDP templates per the founder's spec: a tabbed-info style and an
 * "eBay-style" long-scroll style. Registered by default so a deployment works
 * with zero configuration; a deployment can register more via
 * registerTemplate() or change the default via setDefaultTemplate().
 */
export const DEFAULT_TEMPLATES: LayoutTemplate[] = [
  {
    key: "pdp.tabbed-detail",
    pageType: "pdp",
    label: "Tabbed Detail",
    description: "Product info organized into tabs (description, specs, reviews).",
  },
  {
    key: "pdp.long-scroll",
    pageType: "pdp",
    label: "Long Scroll",
    description: "A single long-scrolling page with all product info inline (eBay-style).",
  },
  {
    key: "pdp.spec-sheet",
    pageType: "pdp",
    label: "Spec Sheet",
    description: "Spec-table PDP layout with monospace pricing, per \"Datasheet Storefront\".",
  },
  // nav -- "nav.top-bar" is today's only current chrome layout and MUST stay first so it
  // remains the deterministic fallback default for the 7 pre-existing bundles.
  {
    key: "nav.top-bar",
    pageType: "nav",
    label: "Top Bar",
    description: "Standard horizontal top navigation bar (today's current chrome layout).",
  },
  {
    key: "nav.rail",
    pageType: "nav",
    label: "Rail",
    description: "Fixed left side-rail nav with jump links, per \"Blaze Theme\".",
  },
  {
    key: "nav.blueprint-bar",
    pageType: "nav",
    label: "Blueprint Bar",
    description: "Blueprint-style top nav bar with dot-grid page background, per \"Datasheet Storefront\".",
  },
  // home -- "home.standard-grid" is today's current layout and MUST stay first.
  {
    key: "home.standard-grid",
    pageType: "home",
    label: "Standard Grid",
    description: "Today's current uniform product grid layout for the home page.",
  },
  {
    key: "home.magazine-grid",
    pageType: "home",
    label: "Magazine Grid",
    description: "Asymmetric feature-card layout, per \"The Slow Catalog\".",
  },
  {
    key: "home.spec-grid",
    pageType: "home",
    label: "Spec Grid",
    description: "Dense datasheet-style grid, per \"Datasheet Storefront\".",
  },
  {
    key: "home.maximalist-grid",
    pageType: "home",
    label: "Maximalist Grid",
    description: "Asymmetric bento grid of sticker-style product cards, per \"Blaze Theme\".",
  },
  // category -- "category.standard-grid" is today's current layout and MUST stay first.
  {
    key: "category.standard-grid",
    pageType: "category",
    label: "Standard Grid",
    description: "Today's current uniform product grid layout for category/PLP pages.",
  },
  {
    key: "category.magazine-grid",
    pageType: "category",
    label: "Magazine Grid",
    description: "Asymmetric feature-card layout, per \"The Slow Catalog\".",
  },
  {
    key: "category.spec-grid",
    pageType: "category",
    label: "Spec Grid",
    description: "Dense datasheet-style grid, per \"Datasheet Storefront\".",
  },
  {
    key: "category.maximalist-grid",
    pageType: "category",
    label: "Maximalist Grid",
    description: "Uniform grid of sticker-style product cards, per \"Blaze Theme\".",
  },
  // cart -- "cart.standard" is today's current layout and MUST stay first.
  {
    key: "cart.standard",
    pageType: "cart",
    label: "Standard",
    description: "Today's current standard cart layout.",
  },
  {
    key: "cart.receipt-style",
    pageType: "cart",
    label: "Receipt Style",
    description: "Receipt-styled cart, per \"The Slow Catalog\".",
  },
  {
    key: "cart.spec-table",
    pageType: "cart",
    label: "Spec Table",
    description: "Spec-table treatment, per \"Datasheet Storefront\".",
  },
];

export function createThemingService(initial?: {
  templates?: LayoutTemplate[];
  tokens?: StyleTokens;
}): ThemingService {
  const templatesByPageType = new Map<string, LayoutTemplate[]>();
  const defaultsByPageType = new Map<string, string>();
  let tokens: StyleTokens = { ...(initial?.tokens ?? {}) };

  function register(template: LayoutTemplate): void {
    const existing = templatesByPageType.get(template.pageType) ?? [];
    templatesByPageType.set(template.pageType, [...existing, template]);
  }

  for (const template of initial?.templates ?? DEFAULT_TEMPLATES) {
    register(template);
  }

  return {
    registerTemplate: register,

    listTemplates(pageType) {
      return [...(templatesByPageType.get(pageType) ?? [])];
    },

    resolveTemplate(pageType, override) {
      if (override) return override;
      const configuredDefault = defaultsByPageType.get(pageType);
      if (configuredDefault) return configuredDefault;
      const templates = templatesByPageType.get(pageType);
      return templates && templates.length > 0 ? templates[0]!.key : null;
    },

    setDefaultTemplate(pageType, templateKey) {
      defaultsByPageType.set(pageType, templateKey);
    },

    getConfiguredDefault(pageType) {
      return defaultsByPageType.get(pageType) ?? null;
    },

    getTokens() {
      return { ...tokens };
    },

    setTokens(newTokens) {
      tokens = { ...newTokens };
    },
  };
}
