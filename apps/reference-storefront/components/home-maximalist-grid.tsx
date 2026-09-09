import type { ComponentInstance } from "@mercatus-liber/cms";
import type { Product } from "@mercatus-liber/core";
import { CmsSection } from "./cms-sections";
import type { DemoSlug } from "../lib/demos";
import { getServicesForDemo } from "../lib/services";

/**
 * The "home.maximalist-grid" template -- the real "Blaze Theme" home layout
 * (design-discussion.md §1: "fixed left-rail jump-nav pattern" + the bundle's
 * own bold ink-black/orange/thick-border/hard-shadow aesthetic). Genuinely
 * missing before this fix -- the "maximalist" bundle previously pointed
 * `home` at the generic `home.standard-grid` key (see theme-bundles.ts),
 * which is why only the nav looked different for this theme.
 *
 * Every non-`product-grid` CMS section (hero-banner/category-spot/ad-slot/
 * service-area-info) still renders through the exact same
 * cms-sections.tsx <CmsSection/> switch every other template uses -- never
 * forked -- just wrapped in a real sticker-card shell. The `hero-banner`
 * section is the one exception: it gets a genuine "Blaze Theme" hero
 * treatment (big Anton display type, an accent "pop" word, a hard-shadow CTA
 * row) built directly from the same real `headline`/`subheadline` config
 * every other template already reads, not fabricated content.
 *
 * `product-grid` sections render as a real asymmetric bento grid of sticker
 * product cards (mockup's `.product-grid`/`.card` treatment) using this
 * demo's actual seeded Product + Sku data (catalog.listSkusByProduct for a
 * real representative price) -- works generically across all 3 demos'
 * actual product counts (print-shop's home has zero product-grid sections at
 * all; northline/broadleaf each have one with a handful of real products),
 * never assuming the mockup's fixed 5-item layout is always available.
 * Classes are all `mx-`-prefixed per this epic's collision-avoidance
 * convention (the editorial/datasheet themes are being built concurrently in
 * sibling files, never this one).
 */

interface CardData {
  key: string;
  title: string;
  href: string;
  status: string;
  priceLabel: string | null;
}

async function loadProductGridCards(demoSlug: DemoSlug, config: Record<string, unknown>): Promise<CardData[]> {
  const { catalog } = await getServicesForDemo(demoSlug);
  const productIds = Array.isArray(config.productIds) ? (config.productIds as string[]) : [];
  const products = (await Promise.all(productIds.map((id) => catalog.getProduct(id)))).filter(
    (p): p is Product => p !== null,
  );

  return Promise.all(
    products.map(async (product) => {
      const skus = await catalog.listSkusByProduct(product.id);
      const priceLabel =
        skus.length > 0
          ? `${(Math.min(...skus.map((s) => s.price.amount)) / 100).toFixed(2)} ${skus[0]!.price.currency}`
          : null;
      return {
        key: product.id,
        title: product.title,
        href: `/demo/${demoSlug}/products/${product.slug}`,
        status: product.status,
        priceLabel,
      };
    }),
  );
}

/** Bento area classes for the mockup's 5-slot `grid-template-areas` -- degrades gracefully for demos (e.g. print-shop's home) with fewer than 5 real products, never rendering an empty named area. */
const BENTO_AREA_CLASSES = ["mx-area-a", "mx-area-b", "mx-area-c", "mx-area-d", "mx-area-e"];

function ProductBento({ cards }: { cards: CardData[] }) {
  if (cards.length === 0) return null;
  // 1-4 real products: a simple, still-asymmetric (first card larger) responsive grid.
  // 5+: the real mockup 5-slot bento (extra products beyond 5 fall into a plain follow-on row).
  const bento = cards.slice(0, 5);
  const overflow = cards.slice(5);

  return (
    <>
      <div className={cards.length >= 5 ? "mx-product-grid" : "mx-product-grid mx-product-grid-compact"}>
        {bento.map((card, i) => (
          <a key={card.key} href={card.href} className={`mx-card ${BENTO_AREA_CLASSES[i] ?? ""}`}>
            <div className="mx-card-art">
              <span className="mx-card-tag">{card.status}</span>
              <span className="mx-card-glyph">{card.title.slice(0, 1).toUpperCase()}</span>
            </div>
            <div className="mx-card-body">
              <h3>{card.title}</h3>
              <div className="mx-card-foot">
                <span className="mx-price">{card.priceLabel ?? "—"}</span>
                <span className="mx-quickadd">View</span>
              </div>
            </div>
          </a>
        ))}
      </div>
      {overflow.length > 0 && (
        <div className="mx-category-grid" style={{ marginTop: "var(--space-md, 32px)" }}>
          {overflow.map((card) => (
            <a key={card.key} href={card.href} className="mx-card">
              <div className="mx-card-art">
                <span className="mx-card-tag">{card.status}</span>
                <span className="mx-card-glyph">{card.title.slice(0, 1).toUpperCase()}</span>
              </div>
              <div className="mx-card-body">
                <h3>{card.title}</h3>
                <div className="mx-card-foot">
                  <span className="mx-price">{card.priceLabel ?? "—"}</span>
                  <span className="mx-quickadd">View</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function BlazeHero({ config }: { config: Record<string, unknown> }) {
  const headline = String(config.headline ?? "");
  const subheadline = config.subheadline ? String(config.subheadline) : null;
  const words = headline.split(" ");
  const lastWord = words.pop();
  const lead = words.join(" ");

  return (
    <section className="mx-hero">
      <div className="mx-hero-inner">
        <h1>
          {lead ? `${lead} ` : null}
          {lastWord ? <span className="mx-pop">{lastWord}</span> : null}
        </h1>
        {subheadline && <p>{subheadline}</p>}
        <div className="mx-btn-row">
          <a href="#mx-home-grid" className="mx-btn mx-btn-primary">
            Shop now
          </a>
          <a href="#mx-home-grid" className="mx-btn mx-btn-ghost">
            Browse the grid
          </a>
        </div>
      </div>
    </section>
  );
}

export async function HomeMaximalistGrid({ demoSlug, sections }: { demoSlug: DemoSlug; sections: ComponentInstance[] }) {
  const resolvedSections = await Promise.all(
    sections.map(async (section) => {
      if (section.componentType === "product-grid") {
        return { kind: "product-grid" as const, cards: await loadProductGridCards(demoSlug, section.config) };
      }
      return { kind: "other" as const, section };
    }),
  );

  return (
    <div className="mx-home">
      <style>{MX_HOME_CSS}</style>
      {resolvedSections.map((entry, i) => {
        if (entry.kind === "product-grid") {
          return (
            <div key={i} id="mx-home-grid">
              <ProductBento cards={entry.cards} />
            </div>
          );
        }
        const { section } = entry;
        if (section.componentType === "hero-banner") {
          return <BlazeHero key={i} config={section.config} />;
        }
        return (
          <div key={i} className="mx-section-card">
            <CmsSection demoSlug={demoSlug} section={section} pageSlug="home" />
          </div>
        );
      })}
    </div>
  );
}

const MX_HOME_CSS = `
  .mx-home { display: flex; flex-direction: column; gap: var(--space-md, 32px); }

  .mx-hero {
    background: var(--color-background);
    border: 3px solid var(--color-border, #17130F);
    border-radius: 16px;
    box-shadow: 9px 9px 0 var(--color-border, #17130F);
    padding: clamp(28px, 5vw, 56px);
    margin-bottom: var(--space-xs, 8px);
  }
  .mx-hero h1 {
    font-family: 'Anton', 'Archivo Black', Impact, ui-sans-serif, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    line-height: 0.92;
    font-size: clamp(36px, 6vw, 72px);
    margin: 0;
  }
  .mx-hero .mx-pop { color: var(--color-primary, #FF4515); -webkit-text-stroke: 2px var(--color-border, #17130F); }
  .mx-hero p { max-width: 46ch; font-size: 18px; color: var(--color-muted, #55503f); margin: 18px 0 26px; }

  .mx-btn-row { display: flex; gap: 14px; flex-wrap: wrap; }
  .mx-btn {
    font-family: var(--font-family, 'Archivo', sans-serif); font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.04em; font-size: 14px; border: 3px solid var(--color-border, #17130F);
    border-radius: 10px; padding: 12px 22px; box-shadow: 5px 5px 0 var(--color-border, #17130F);
    transition: transform 120ms ease, box-shadow 120ms ease; text-decoration: none; display: inline-flex;
    align-items: center; gap: 8px; color: var(--color-text, #17130F);
  }
  .mx-btn:hover { transform: translate(-2px, -2px); box-shadow: 7px 7px 0 var(--color-border, #17130F); }
  .mx-btn-primary { background: var(--color-primary, #FF4515); }
  .mx-btn-ghost { background: #fff; }

  .mx-section-card {
    border: 3px solid var(--color-border, #17130F);
    border-radius: 16px;
    box-shadow: 6px 6px 0 var(--color-border, #17130F);
    padding: var(--space-sm, 16px);
    background: #fff;
  }

  .mx-product-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    grid-template-areas: "a a a a a a a b b b b b" "a a a a a a a c c c c c" "d d d d d d e e e e e e";
    gap: 22px;
  }
  .mx-product-grid-compact { grid-template-areas: "a a a a a a a a a a a a"; grid-auto-rows: auto; }
  .mx-area-a { grid-area: a; } .mx-area-b { grid-area: b; } .mx-area-c { grid-area: c; }
  .mx-area-d { grid-area: d; } .mx-area-e { grid-area: e; }
  .mx-area-a .mx-card-art { min-height: 220px; }
  @media (max-width: 780px) {
    .mx-product-grid, .mx-product-grid-compact { grid-template-columns: 1fr; grid-template-areas: "a" "b" "c" "d" "e"; }
  }

  .mx-category-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 22px; }

  .mx-card {
    background: #fff; border: 3px solid var(--color-border, #17130F); border-radius: 16px;
    box-shadow: 6px 6px 0 var(--color-border, #17130F); display: flex; flex-direction: column;
    overflow: hidden; transition: transform 150ms ease, box-shadow 150ms ease; text-decoration: none;
    color: inherit;
  }
  .mx-card:hover { transform: translate(-3px, -3px); box-shadow: 9px 9px 0 var(--color-border, #17130F); }
  .mx-card-art {
    position: relative; padding: 22px; min-height: 130px; display: flex; align-items: center;
    justify-content: center; border-bottom: 3px solid var(--color-border, #17130F); background: #C6401F;
  }
  .mx-card-glyph {
    font-family: 'Anton', sans-serif; font-size: 48px; color: #fff; -webkit-text-stroke: 1.5px var(--color-border, #17130F);
  }
  .mx-card-tag {
    position: absolute; top: 10px; left: 10px; background: #fff; color: var(--color-text, #17130F);
    border: 2px solid var(--color-border, #17130F); border-radius: 999px; font-family: 'Space Mono', monospace;
    font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; padding: 3px 9px; text-transform: uppercase;
  }
  .mx-card-body { padding: 16px 16px 18px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
  .mx-card-body h3 {
    font-family: var(--font-family, 'Archivo', sans-serif); font-weight: 800; font-size: 16px;
    text-transform: none; letter-spacing: 0; margin: 0;
  }
  .mx-card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 6px; }
  .mx-price { font-family: 'Space Mono', ui-monospace, monospace; font-weight: 700; font-size: 18px; }
  .mx-quickadd {
    border: 2.5px solid var(--color-border, #17130F); background: var(--color-primary, #FF4515);
    color: var(--color-text, #17130F); border-radius: 8px; font-weight: 800; font-size: 11px;
    text-transform: uppercase; padding: 6px 10px; box-shadow: 3px 3px 0 var(--color-border, #17130F);
  }
`;
