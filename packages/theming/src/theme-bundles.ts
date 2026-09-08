import type { StyleTokens, ThemingService } from "./types.js";

/**
 * A theme bundle: a grouping of layout choices + style tokens applied across
 * the whole site as a convenience -- per docs/subsystems/06-theming-layout.md's
 * "Theme bundles" section. Deliberately sugar over ThemingService's existing
 * primitives (setTokens + setDefaultTemplate), never a parallel mechanism.
 */
export interface ThemeBundle {
  key: string;
  label: string;
  tokens: StyleTokens;
  /** Page type -> default template key, e.g. { pdp: "pdp.long-scroll" }. */
  defaultTemplatesByPageType: Record<string, string>;
}

/** Pure composition of ThemingService's existing methods -- proves a theme is not a separate code path. */
export function applyTheme(theming: ThemingService, bundle: ThemeBundle): void {
  theming.setTokens(bundle.tokens);
  for (const [pageType, templateKey] of Object.entries(bundle.defaultTemplatesByPageType)) {
    theming.setDefaultTemplate(pageType, templateKey);
  }
}

/**
 * Every bundle below fills in the same token vocabulary: --color-background,
 * --color-text, --color-primary, --color-accent, --font-family, --radius.
 */
export const THEME_BUNDLES: ThemeBundle[] = [
  {
    key: "classic",
    label: "Classic",
    tokens: {
      "--color-background": "#ffffff",
      "--color-text": "#1a1a1a",
      "--color-primary": "#2563eb",
      "--color-accent": "#0d9488",
      "--font-family": "system-ui, sans-serif",
      "--radius": "4px",
    },
    defaultTemplatesByPageType: { pdp: "pdp.tabbed-detail" },
  },
  {
    key: "dark",
    label: "Dark",
    tokens: {
      "--color-background": "#111827",
      "--color-text": "#f9fafb",
      "--color-primary": "#60a5fa",
      "--color-accent": "#34d399",
      "--font-family": "system-ui, sans-serif",
      "--radius": "4px",
    },
    defaultTemplatesByPageType: { pdp: "pdp.tabbed-detail" },
  },
  {
    key: "minimal",
    label: "Minimal",
    tokens: {
      "--color-background": "#ffffff",
      "--color-text": "#000000",
      "--color-primary": "#000000",
      "--color-accent": "#666666",
      "--font-family": "Georgia, serif",
      "--radius": "0px",
    },
    defaultTemplatesByPageType: { pdp: "pdp.long-scroll" },
  },
  {
    key: "vibrant",
    label: "Vibrant",
    tokens: {
      "--color-background": "#fff7ed",
      "--color-text": "#1a1a1a",
      "--color-primary": "#f97316",
      "--color-accent": "#ec4899",
      "--font-family": "system-ui, sans-serif",
      "--radius": "12px",
    },
    defaultTemplatesByPageType: { pdp: "pdp.long-scroll" },
  },
  {
    key: "retro",
    label: "Retro",
    tokens: {
      "--color-background": "#fdf6e3",
      "--color-text": "#073642",
      "--color-primary": "#b58900",
      "--color-accent": "#cb4b16",
      "--font-family": "'Courier New', monospace",
      "--radius": "2px",
    },
    defaultTemplatesByPageType: { pdp: "pdp.tabbed-detail" },
  },
  {
    key: "high-contrast",
    label: "High Contrast",
    tokens: {
      "--color-background": "#000000",
      "--color-text": "#ffffff",
      "--color-primary": "#ffff00",
      "--color-accent": "#00ffff",
      "--font-family": "system-ui, sans-serif",
      "--radius": "0px",
    },
    defaultTemplatesByPageType: { pdp: "pdp.long-scroll" },
  },
  {
    // Invented for the epic-15b public demo (Northline Home Tech, a
    // fictional smart-home installer) -- see
    // .pHive/epics/service-demo-theme-public/docs/brand-and-scope.md.
    // A professional, trustworthy "on-site technician" feel: indigo-blue
    // primary, amber accent, light slate background.
    key: "northline",
    label: "Northline",
    tokens: {
      "--color-background": "#f8fafc",
      "--color-text": "#0f172a",
      "--color-primary": "#1e40af",
      "--color-accent": "#f59e0b",
      "--font-family": "system-ui, sans-serif",
      "--radius": "6px",
    },
    defaultTemplatesByPageType: { pdp: "pdp.tabbed-detail" },
  },
];

export function getThemeBundle(key: string): ThemeBundle | undefined {
  return THEME_BUNDLES.find((bundle) => bundle.key === key);
}
