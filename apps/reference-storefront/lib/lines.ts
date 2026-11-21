/**
 * Lines (sales catalogs) in the demo: named, scheduled sets of products with
 * their own landing page, like HCL Commerce's sales catalogs. Each belongs to
 * one demo through masterCatalogId (the demo's own catalog), so demos sharing
 * a database see only their own.
 */
import type { LineOps } from "@mercatus-liber/ai-interface";
import type { Catalog, CatalogService } from "@mercatus-liber/catalog";
import { lifecycle, type Lifecycle } from "@mercatus-liber/core";
import { DEMO_CATALOG_SLUG, type DemoSlug } from "./demos";

export interface LineSummary {
  line: Catalog;
  lifecycle: Lifecycle;
}

/** This demo's lines that aren't drafts (or all of them with includeDrafts, for the admin), soonest first (lines with no start first). */
export async function listLinesForDemo(catalog: CatalogService, demoSlug: DemoSlug, now: Date = new Date(), options: { includeDrafts?: boolean } = {}): Promise<LineSummary[]> {
  const master = await catalog.getCatalogBySlug(DEMO_CATALOG_SLUG[demoSlug]);
  if (!master) return [];
  const lines = await catalog.listCatalogs({ kind: "sales", masterCatalogId: master.id });
  return lines
    .map((line) => ({ line, lifecycle: lifecycle({ status: line.status ?? "active", activeFrom: line.activeFrom ?? null, activeTo: line.activeTo ?? null }, now) }))
    .filter((l) => options.includeDrafts || l.lifecycle.state !== "inactive")
    .sort((a, b) => (a.line.activeFrom ? Date.parse(a.line.activeFrom) : 0) - (b.line.activeFrom ? Date.parse(b.line.activeFrom) : 0));
}

/** A line's landing data, only when it belongs to this demo and isn't a draft. */
export async function getLineForDemo(catalog: CatalogService, demoSlug: DemoSlug, lineSlug: string, now: Date = new Date()) {
  const master = await catalog.getCatalogBySlug(DEMO_CATALOG_SLUG[demoSlug]);
  const landing = await catalog.getCatalogLanding(lineSlug, now);
  if (!master || !landing || landing.catalog.kind !== "sales" || landing.catalog.masterCatalogId !== master.id || landing.lifecycle.state === "inactive") return null;
  return landing;
}

/**
 * Sections as the admin form edits them, one per line:
 * `desk | Desk | product-slug, other-slug`. Product slugs, not ids.
 */
export function parseSectionsText(text: string): { slug: string; title: string; productSlugs: string[] }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [slug = "", title = "", products = ""] = line.split("|").map((part) => part.trim());
      if (!slug || !title) throw new Error(`Section line ${i + 1} needs "slug | Title | product-slug, ...".`);
      return { slug, title, productSlugs: products.split(",").map((p) => p.trim()).filter(Boolean) };
    });
}

export function formatSectionsText(sections: { slug: string; title: string; productSlugs: string[] }[]): string {
  return sections.map((s) => `${s.slug} | ${s.title} | ${s.productSlugs.join(", ")}`).join("\n");
}

/** This demo's lines as agent tools (@mercatus-liber/ai-interface's LineOps). */
export function lineOps(catalog: CatalogService, demoSlug: DemoSlug): LineOps {
  return {
    async listLines({ state }) {
      const lines = await listLinesForDemo(catalog, demoSlug);
      return lines
        .filter((l) => !state || l.lifecycle.state === state)
        .map(({ line, lifecycle }) => ({ slug: line.slug, name: line.name, title: line.hero?.title ?? line.name, state: lifecycle.state, opens: lifecycle.startsAt, closes: lifecycle.endsAt }));
    },
    async getLine(slug) {
      const landing = await getLineForDemo(catalog, demoSlug, slug);
      if (!landing) return null;
      return {
        slug: landing.catalog.slug,
        name: landing.catalog.name,
        hero: landing.catalog.hero ?? null,
        state: landing.lifecycle.state,
        opens: landing.lifecycle.startsAt,
        closes: landing.lifecycle.endsAt,
        sections: landing.sections.map((s) => ({ slug: s.slug, title: s.title, products: s.products.map((p) => ({ slug: p.slug, title: p.title })) })),
      };
    },
    async saveLine(input) {
      const master = await catalog.getCatalogBySlug(DEMO_CATALOG_SLUG[demoSlug]);
      if (!master) throw new Error("This demo has no catalog.");
      const sections = [];
      for (const section of input.sections ?? []) {
        const productIds: string[] = [];
        for (const slug of section.productSlugs) {
          const product = await catalog.getProductBySlug(slug);
          if (!product) throw new Error(`No product "${slug}".`);
          productIds.push(product.id);
        }
        sections.push({ slug: section.slug, title: section.title, productIds });
      }
      const fields = {
        name: input.name,
        description: input.description ?? "",
        ...(input.status ? { status: input.status } : {}),
        ...(input.activeFrom !== undefined ? { activeFrom: input.activeFrom } : {}),
        ...(input.activeTo !== undefined ? { activeTo: input.activeTo } : {}),
        ...(input.hero ? { hero: input.hero } : {}),
        ...(input.sections ? { sections } : {}),
      };
      const existing = await catalog.getCatalogBySlug(input.slug);
      if (existing && (existing.kind !== "sales" || existing.masterCatalogId !== master.id)) throw new Error(`The slug "${input.slug}" belongs to another catalog.`);
      const line = existing ? await catalog.updateCatalog(existing.id, fields) : await catalog.createCatalog({ slug: input.slug, kind: "sales", masterCatalogId: master.id, ...fields });
      const applied = input.applyWindowToProducts ? (await catalog.applyCatalogWindowToProducts(line.id)).updated.length : 0;
      return { id: line.id, slug: line.slug, created: !existing, productsGivenWindow: applied };
    },
  };
}
