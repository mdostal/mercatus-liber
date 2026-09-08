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

    getTokens() {
      return { ...tokens };
    },

    setTokens(newTokens) {
      tokens = { ...newTokens };
    },
  };
}
