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
 * Every bundle below fills in at least the original six-token vocabulary:
 * --color-background, --color-text, --color-primary, --color-accent, --font-family,
 * --radius. "classic" (the actual default every demo loads) additionally defines a
 * richer vocabulary -- --color-muted, --color-border, a --space-* scale, a
 * --font-size-heading-lg/md and --font-size-body type scale, and --shadow-card -- refined in place as
 * part of the storefront-visual-redesign epic (story redesign-01). The other six bundles
 * are untouched demonstration/utility bundles and don't define these new tokens; a
 * component consuming them needs a sensible fallback for bundles that don't define them
 * (noted here as a finding for the later component-consuming story, not solved in this
 * token-only change).
 */
export const THEME_BUNDLES: ThemeBundle[] = [
  {
    // Refined as the actual default every demo loads (storefront-visual-redesign epic,
    // story redesign-01) -- not an eighth bundle. The original tokens were a reasonable
    // starting point (flat blue-on-white, system-ui) but composed with nothing: no muted
    // text color, no border color, no spacing/type scale, no elevation. Refined here into
    // a genuinely coherent system built on a warm, print-catalog-leaning palette rather
    // than a generic app palette.
    key: "classic",
    label: "Classic",
    tokens: {
      // Warm ivory instead of stark #ffffff, and a warm near-black instead of flat
      // #1a1a1a -- both read as "considered" rather than default-browser white/black,
      // and set up --color-muted/--color-border (also warm-toned) to feel like part of
      // one family instead of a cold gray bolted onto a cold background.
      "--color-background": "#fdfbf7",
      "--color-text": "#1c1917",
      // Deepened from the original #2563eb/#0d9488 (Tailwind blue-600/teal-600) to
      // blue-700/teal-700: same recognizable blue-primary + teal-accent pairing, just
      // richer and more confident -- reads less like a default component-library demo.
      "--color-primary": "#1d4ed8",
      "--color-accent": "#0f766e",
      // New: secondary/muted text (e.g. a price's currency suffix, helper copy) and a
      // subtle card/section divider. Both are warm grays (stone-500 / stone-200) so they
      // sit naturally against the warm background/text above instead of reading as a
      // mismatched cool gray dropped onto a warm page.
      "--color-muted": "#78716c",
      "--color-border": "#e7e5e4",
      // A serif stack, not system-ui: system-ui reads as "whatever this OS's UI chrome
      // font is" -- correct for an app, generic for a shop. A serif built from
      // widely-preinstalled fonts (Iowan Old Style on Apple platforms, Palatino
      // elsewhere, Georgia as the universal fallback) reads more like a considered goods
      // catalog than a web app, without requiring any font-loading infrastructure this
      // package doesn't have.
      "--font-family": "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
      // Softened from 4px to 6px -- enough to read as "designed" (vs. minimal's stark
      // 0px) without tipping into vibrant's playful 12px.
      "--radius": "6px",
      // 4-step spacing scale, ratio 2 (each step doubles the previous): 0.5rem -> 1rem ->
      // 2rem -> 4rem. A strict doubling is the easiest ratio to reason about consistently
      // across very different uses -- xs for tight inline gaps (e.g. a price and its
      // muted currency suffix), sm for internal component padding, md for gaps between
      // components within a section, lg for gaps between whole page sections -- while
      // still producing a visibly distinct step at every level.
      "--space-xs": "0.5rem",
      "--space-sm": "1rem",
      "--space-md": "2rem",
      "--space-lg": "4rem",
      // Minimal 3-step type scale: page-level heading (hero/page title), section-level
      // heading, and body copy. 40px/24px/16px gives each level a clearly distinct role
      // without needing a full modular scale for what's still a token map, not a design
      // system.
      "--font-size-heading-lg": "2.5rem",
      "--font-size-heading-md": "1.5rem",
      "--font-size-body": "1rem",
      // One subtle card shadow for product/category tile elevation: a tight low-opacity
      // contact shadow plus a softer, larger ambient one, both tinted from --color-text
      // (warm near-black) rather than pure black so the shadow reads as part of the same
      // warm palette instead of a generic cool-gray dropped in from elsewhere.
      "--shadow-card": "0 1px 2px rgba(28, 25, 23, 0.06), 0 4px 12px rgba(28, 25, 23, 0.08)",
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
      // brand-primary-foreground-contrast-audit (a11y-audit finding #17): raw
      // --color-primary (#f97316) measures 2.64:1 against --color-background
      // (#fff7ed) -- a real, confirmed-live axe-core color-contrast failure
      // everywhere --color-primary is used as small/body-sized foreground
      // text (nav-top-bar.tsx's shop nav links; the Add-to-cart/Submit-review
      // button ink in pdp-long-scroll.tsx, paired with the *unchanged*
      // --color-primary fill). Additive, same-hue derived token -- NOT a
      // replacement for --color-primary itself, which stays #f97316
      // everywhere it's still a correct fill/border/decorative accent.
      // #4F2102 is the same hue/saturation, darkened until it clears 4.5:1
      // AA against *both* --color-background (12.75:1, huge margin) *and*
      // the bundle's own unchanged --color-primary fill (4.83:1, real
      // margin) -- the second constraint is what lets this one value double
      // as safe ink directly on top of an unmodified --color-primary button
      // fill, not just as text on the page background.
      "--color-primary-text": "#4F2102",
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
      // brand-primary-foreground-contrast-audit (a11y-audit finding #17,
      // "by hand-calculation... also a fail"): raw --color-primary
      // (#b58900) measures 2.98:1 against --color-background (#fdf6e3),
      // same broken pattern as vibrant above (nav-top-bar.tsx shop nav
      // links; pdp-tabbed-detail.tsx's CTA button ink). #2E2300 is the same
      // hue/saturation, darkened until it clears 4.5:1 AA against both
      // --color-background (14.35:1) and the unchanged --color-primary fill
      // (4.82:1).
      "--color-primary-text": "#2E2300",
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
  {
    // "The Slow Catalog" -- warm editorial/artisan-market. Real token values extracted
    // directly from the source design's own CSS custom properties (see
    // .pHive/epics/storefront-design-system-v2/stories/design-system-v2-01-template-registry-and-bundles.yaml).
    key: "editorial",
    label: "Editorial",
    tokens: {
      "--color-background": "#F2E9D8",
      "--color-text": "#241C14",
      "--color-primary": "#B14B2A",
      "--color-accent": "#5E6E45",
      // a11y-audit: the original #7A6C58 measured 4.23:1 against
      // --color-background (#F2E9D8) via axe-core, live on print-shop's own
      // top utility nav (11.84px normal-weight text) -- failing WCAG AA's
      // 4.5:1 normal-text minimum by a hair. The first re-measure, #6F6250
      // (4.92:1 against the raw page background), still failed
      // (4.23:1 -- coincidentally the exact original ratio) against the
      // theme-switcher's own ".ts-pill" background, which is
      // color-mix(in srgb, var(--color-background) 92%, var(--color-text)
      // 8%) (#E2D9C8, not the raw #F2E9D8) -- a second, real "tokens
      // combined in ways the first fix didn't check" case, confirmed live
      // via axe-core after deploying the first fix. #635747 passes both:
      // 5.84:1 against the raw background, 5.02:1 against the darkened
      // pill background.
      "--color-muted": "#635747",
      "--color-border": "#C7B586",
      "--font-family": "'Newsreader', 'Iowan Old Style', Georgia, serif",
      // Additive, backward-compatible token -- only "editorial" defines it. Always
      // referenced as var(--font-family-display, var(--font-family)) so every other
      // bundle (which doesn't define it) falls back to --font-family with zero behavior
      // change.
      "--font-family-display": "'Fraunces', 'Iowan Old Style', Georgia, serif",
      "--radius": "3px",
      "--space-xs": "0.5rem",
      "--space-sm": "1.25rem",
      "--space-md": "2rem",
      "--space-lg": "4.5rem",
      "--font-size-heading-lg": "2.5rem",
      "--font-size-heading-md": "1.5rem",
      "--font-size-body": "1rem",
      "--shadow-card": "0 1px 2px rgba(36,28,20,0.08), 0 4px 12px rgba(36,28,20,0.10)",
      // brand-primary-foreground-contrast-audit (a11y-audit finding #17):
      // raw --color-primary (#B14B2A) measures 4.457:1 against
      // --color-background (#F2E9D8) -- just under the 4.5:1 AA line,
      // confirmed live on cart-receipt-style.tsx's ".ed-btn-ghost" buttons
      // and (while re-verifying finding #16's fix) the CTA button ink in
      // pdp-long-scroll.tsx's EditorialPdpLongScroll. Unlike vibrant/retro/
      // maximalist, editorial's own --color-primary is dark enough that NO
      // same-hue ink -- not even pure black -- reaches 4.5:1 against the
      // *unchanged* --color-primary fill (black-on-#B14B2A only reaches
      // 3.91:1), so this value is used two ways: (a) directly as ink for the
      // ghost buttons/sku-low-stock text/rating stars, where it's read
      // against --color-background as before, and (b) as the FILL itself
      // for the CTA/checkout buttons (cart-receipt-style.tsx's
      // ".ed-btn-checkout", pdp-long-scroll.tsx's ".ed-btn-add"), with the
      // existing --color-background ink left untouched -- swapping which
      // side of that pair is "primary" rather than trying to out-darken an
      // impossible ink choice. #A44627 is the same hue/saturation as
      // #B14B2A, darkened just enough to clear 4.5:1 against
      // --color-background (5.00:1, real margin) in both roles.
      "--color-primary-text": "#A44627",
    },
    defaultTemplatesByPageType: {
      pdp: "pdp.long-scroll",
      nav: "nav.top-bar",
      home: "home.magazine-grid",
      category: "category.magazine-grid",
      cart: "cart.receipt-style",
    },
  },
  {
    // "Blaze Theme" -- bold modern maximalist.
    key: "maximalist",
    label: "Maximalist",
    tokens: {
      "--color-background": "#EEF0E6",
      "--color-text": "#17130F",
      "--color-primary": "#FF4515",
      "--color-accent": "#263B8C",
      "--color-muted": "#55503f",
      "--color-border": "#17130F",
      "--font-family": "'Archivo', system-ui, sans-serif",
      "--radius": "16px",
      "--space-xs": "0.5rem",
      "--space-sm": "1rem",
      "--space-md": "2rem",
      "--space-lg": "4rem",
      "--font-size-heading-lg": "3rem",
      "--font-size-heading-md": "1.75rem",
      "--font-size-body": "1rem",
      "--shadow-card": "6px 6px 0 #17130F",
      // brand-primary-foreground-contrast-audit (a11y-audit finding #17):
      // raw --color-primary (#FF4515) measures 2.98:1 against
      // --color-background (#EEF0E6), confirmed live on pdp-tabbed-detail.
      // tsx's CTA button ink (paired with the unchanged --color-primary
      // fill). NOTE: this does NOT touch ".mx-pop" (home-maximalist-grid.
      // tsx's hero "pop" word) -- that usage keeps raw --color-primary
      // deliberately, per this epic's own scope: it already has a real,
      // if axe-invisible, mitigation (a 2px text-stroke) and is the
      // bundle's signature large-display treatment, not a body-text
      // regression. #3F0D00 is the same hue/saturation, darkened until it
      // clears 4.5:1 AA against both --color-background (14.38:1) and the
      // unchanged --color-primary fill (4.82:1).
      "--color-primary-text": "#3F0D00",
    },
    defaultTemplatesByPageType: {
      pdp: "pdp.tabbed-detail",
      nav: "nav.rail",
      // visual-fidelity-maximalist: previously pointed at the generic
      // "standard" grid keys, which is why only the nav looked distinct for
      // this theme (the real bug this fix corrects) -- now points at the
      // real "Blaze Theme"-specific templates built for this fix.
      home: "home.maximalist-grid",
      category: "category.maximalist-grid",
      cart: "cart.standard",
    },
  },
  {
    // "Datasheet Storefront" -- precision technical/minimal-grid.
    key: "datasheet",
    label: "Datasheet",
    tokens: {
      "--color-background": "#F1F3F6",
      "--color-text": "#12151B",
      "--color-primary": "#C8460A",
      "--color-accent": "#5A6170",
      // a11y-audit: the original #8891A0 measured 2.86:1 against
      // --color-background (#F1F3F6) via axe-core, live on print-shop's own
      // top utility nav and the theme-switcher's ".ts-label" text -- a
      // severe fail of WCAG AA's 4.5:1 normal-text minimum (16 real nodes
      // flagged on one page). #626B78 stays in the same cool blue-slate
      // family as this bundle's own --color-accent (#5A6170) but reaches
      // 4.85:1, a real pass with margin.
      "--color-muted": "#626B78",
      "--color-border": "#D2D7E0",
      "--font-family": "'IBM Plex Sans', system-ui, sans-serif",
      "--radius": "2px",
      "--space-xs": "8px",
      "--space-sm": "16px",
      "--space-md": "32px",
      "--space-lg": "64px",
      "--font-size-heading-lg": "2.25rem",
      "--font-size-heading-md": "1.375rem",
      "--font-size-body": "1rem",
      "--shadow-card": "none",
      // brand-primary-foreground-contrast-audit (a11y-audit finding #17):
      // NOT one of the audit's originally-named bundles, found by this
      // epic's own required full re-verification of all 10 bundles. Raw
      // --color-primary (#C8460A) measures 4.356:1 against
      // --color-background (#F1F3F6) -- also just under 4.5:1 AA, live in
      // datasheet-styles.tsx's ".ds-titleblock .ds-num"/".ds-stock-badge.
      // out", home-spec-grid.tsx's ".ds-home-eyebrow", category-spec-grid.
      // tsx's ".ds-specsheet .ds-row.price .ds-v", and pdp-spec-sheet.tsx's
      // ".ds-sku-price"/".ds-rating-stars" (this bundle's own real Add-to-
      // cart button, ".ds-btn-accent", already uses literal white ink at
      // 4.84:1 and needs no change). #A93B08 is the same hue/saturation,
      // darkened until it clears 4.5:1 against --color-background (5.70:1)
      // *and* against ".ds-stock-badge.out"'s own literal #F3E1DC chip
      // background (5.01:1) -- two different real backgrounds this token
      // is read against.
      "--color-primary-text": "#A93B08",
    },
    defaultTemplatesByPageType: {
      // visual-fidelity-datasheet: previously pointed pdp/nav at the
      // generic shared "pdp.tabbed-detail"/"nav.top-bar" keys, which is why
      // only home/category/cart looked distinct for this theme -- the real
      // "unstyled plain HTML" bug this fix corrects (default black links,
      // pipe-separated nav, no real typography/borders/spec-table PDP
      // layout). "pdp.tabbed-detail" is genuinely shared with 6 other
      // bundles (not just "maximalist") and "nav.top-bar" is genuinely
      // shared with 8 -- both now point at real dedicated templates built
      // for this fix instead, with zero change to either shared template
      // or its other consumers.
      pdp: "pdp.spec-sheet",
      nav: "nav.blueprint-bar",
      home: "home.spec-grid",
      category: "category.spec-grid",
      cart: "cart.spec-table",
    },
  },
];

export function getThemeBundle(key: string): ThemeBundle | undefined {
  return THEME_BUNDLES.find((bundle) => bundle.key === key);
}
