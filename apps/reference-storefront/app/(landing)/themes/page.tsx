import type { Metadata } from "next";
import { THEME_BUNDLES, type ThemeBundle } from "@mercatus-liber/theming";
import { applyThemeAction } from "../../../lib/actions";
import { DEMO_REGISTRY, DEMO_SLUGS } from "../../../lib/demos";
import { canonicalUrl } from "../../../lib/site-url";

export const metadata: Metadata = {
  title: "Theme Gallery",
  description:
    "All 10 real theme bundles in @mercatus-liber/theming -- ten complete, distinct visual identities " +
    "driven by the same shared component-level theming system. Preview any theme, then cross-apply it " +
    "onto any of the three live demo stores.",
  alternates: { canonical: canonicalUrl("/themes") },
};

/**
 * landing-visual-glow-up (theme-gallery story): "drop the themes onto a nice
 * landing that shows them off, you can click into each one, you can cross
 * apply them to the store." Every bundle rendered here comes straight from
 * @mercatus-liber/theming's own real THEME_BUNDLES export (packages/theming/
 * src/theme-bundles.ts) -- nothing here is a second, hand-maintained list
 * that could drift from the real bundle set. The one-line description under
 * each bundle's name is a close paraphrase of that file's own doc comment
 * for that bundle (see DESCRIPTIONS below, one entry per bundle, each
 * sourced from the matching comment), not invented copy. The 4 color swatches
 * per card are read directly off that bundle's own `tokens` object
 * (--color-background/--color-text/--color-primary/--color-accent) -- real,
 * data-driven previews, not hardcoded colors.
 *
 * "Cross-apply" is the exact same mechanism app/(landing)/page.tsx's demo
 * cards point at, reused verbatim: lib/actions.ts's already-committed
 * applyThemeAction, submitted as a plain <form> (no client JS) carrying the
 * target demoSlug + the bundle's key -- it sets that demo's theme cookie and
 * redirects straight into `/demo/${demoSlug}`.
 */
const DESIGN_NAMES: Partial<Record<string, string>> = {
  editorial: "The Slow Catalog",
  maximalist: "Blaze Theme",
  datasheet: "Datasheet Storefront",
};

/** One-line paraphrase of theme-bundles.ts's own doc comment for each bundle -- see that file for the full source text. */
const DESCRIPTIONS: Record<string, string> = {
  classic:
    "The refined default every demo loads when nothing else is picked: warm ivory background, deep blue/teal, a considered serif stack, real spacing and type scale, and subtle card elevation.",
  dark: "A straightforward dark-mode utility bundle: near-black background, sky-blue primary, mint-green accent, system-ui type.",
  minimal: "The starkest bundle on purpose: pure black on white, a Georgia serif, zero border radius, and a long-scroll PDP layout.",
  vibrant: "Playful and colorful: warm cream background, orange primary, pink accent, and generous 12px corner rounding.",
  retro: "Terminal-flavored retro: a Solarized-light palette, monospace Courier New type, and sharp 2px corners.",
  "high-contrast": "Built for maximum accessible contrast: pure black background, yellow primary, cyan accent, zero rounding.",
  northline:
    "A professional, trustworthy \"on-site technician\" feel built for the Northline Home Tech demo: indigo-blue primary, amber accent, light slate background.",
  editorial:
    "\"The Slow Catalog\" -- a warm editorial/artisan-market look: Fraunces/Newsreader serif display type, an asymmetric magazine-grid home and category layout, and a receipt-style cart.",
  maximalist:
    "\"Blaze Theme\" -- bold modern maximalist: ink-black text on a soft olive background, blaze-orange primary, thick 3px borders, hard offset shadows, and a fixed left-rail nav.",
  datasheet:
    "\"Datasheet Storefront\" -- precision technical/blueprint-grid: IBM Plex Sans/Mono type, hairline borders, a spec-table PDP, and a dot-grid blueprint background.",
};

function Swatch({ bundle }: { bundle: ThemeBundle }) {
  const t = bundle.tokens;
  const chips: Array<{ label: string; value?: string }> = [
    { label: "background", value: t["--color-background"] },
    { label: "text", value: t["--color-text"] },
    { label: "primary", value: t["--color-primary"] },
    { label: "accent", value: t["--color-accent"] },
  ];
  return (
    <div className="mlt-swatch" style={{ background: t["--color-background"], borderColor: t["--color-border"] ?? t["--color-text"] }}>
      {chips.map((chip) =>
        chip.value ? <span key={chip.label} className="mlt-chip" style={{ background: chip.value }} title={`${chip.label}: ${chip.value}`} /> : null,
      )}
    </div>
  );
}

export default function ThemesPage() {
  return (
    <div className="ml-shell mlt-page">
      <style>{THEMES_CSS}</style>

      <section className="mlt-intro">
        <span className="ml-eyebrow">Theming</span>
        <h1>10 real theme bundles</h1>
        <p>
          Every bundle below is a real <code>ThemeBundle</code> from <code>@mercatus-liber/theming</code> --
          a set of design tokens plus a per-page-type template selection (packages/theming/src/
          theme-bundles.ts). Picking a theme never touches catalog, cart, or CMS code: it only calls{" "}
          <code>theming.setTokens()</code> and <code>theming.setDefaultTemplate()</code>, the same two
          primitives every demo&rsquo;s own theme switcher uses. Click &ldquo;Preview in&rdquo; any store below
          to cross-apply a theme straight onto that store &mdash; it sets that store&rsquo;s own theme cookie
          and takes you there.
        </p>
      </section>

      <div className="mlt-grid">
        {THEME_BUNDLES.map((bundle) => (
          <article key={bundle.key} className="ml-card mlt-card">
            <div className="mlt-card-head">
              <Swatch bundle={bundle} />
              <div>
                <h2>{DESIGN_NAMES[bundle.key] ?? bundle.label}</h2>
                <span className="mlt-key">{bundle.key}</span>
              </div>
            </div>
            <p className="mlt-desc">{DESCRIPTIONS[bundle.key] ?? bundle.label}</p>
            <div className="mlt-preview-row">
              {DEMO_SLUGS.map((slug) => (
                <form action={applyThemeAction} key={slug}>
                  <input type="hidden" name="demoSlug" value={slug} />
                  <input type="hidden" name="theme" value={bundle.key} />
                  <button type="submit" className="ml-btn ml-btn-ghost ml-btn-sm">
                    Preview in {DEMO_REGISTRY[slug].displayName} &rarr;
                  </button>
                </form>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const THEMES_CSS = `
  .mlt-page { padding: 64px 0 96px; }
  .mlt-intro { max-width: 720px; margin-bottom: 48px; }
  .mlt-intro h1 { font-size: clamp(2rem, 4vw, 2.6rem); }
  .mlt-intro p { font-size: 1.02rem; }

  .mlt-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px; }
  .mlt-card { display: flex; flex-direction: column; gap: 16px; }
  .mlt-card-head { display: flex; align-items: center; gap: 16px; }
  .mlt-card-head h2 { font-size: 1.15rem; margin-bottom: 2px; }
  .mlt-key { font-family: var(--ml-font-mono); font-size: 0.76rem; color: var(--ml-ink-faint); }

  .mlt-swatch {
    flex-shrink: 0; width: 64px; height: 64px; border-radius: var(--ml-radius); border: 1px solid;
    display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; overflow: hidden;
  }
  .mlt-chip { display: block; }

  .mlt-desc { font-size: 0.92rem; margin: 0; flex: 1; }

  .mlt-preview-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .mlt-preview-row form { display: contents; }

  @media (max-width: 780px) {
    .mlt-grid { grid-template-columns: 1fr; }
  }
`;
