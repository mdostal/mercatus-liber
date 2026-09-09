# CMS & Marketing: Content, Curation, and Location Pages

Four subsystems make up what a merchandiser or marketer actually touches day to day:
[CMS](/subsystems/05-cms-pages) (page content), [marketing catalog](/subsystems/02-marketing-catalog)
(the standing category taxonomy), [search](/subsystems/03-search) (finding products), and
[service areas](/subsystems/15-service-areas) (location-based marketing pages). All four share
one organizing idea that shows up repeatedly across this framework: **data and page layout are
different subsystems, on purpose.** A category is data (marketing catalog); how a category page
*looks* is theming's job. A service area is data (service areas); its location page is CMS. That
split is what lets a deployment restyle every category page at once without touching a single
category record, and re-curate a category without touching layout code at all.

## CMS: five page types, one shared component vocabulary

The CMS subsystem owns page *content* — not layout, which belongs to
[theming](/theming-and-design-system) — for five page types the framework's founder named
explicitly: home, category, marketing, search, and PDP, plus a sixth (`location`) added later
for service-area pages. Every page type shares the same underlying shape: a page is a title, a
status (`draft` or `published`), and an ordered list of **sections** — content-authored
component instances that reference a component type and a config blob, not hardcoded markup:

```ts
// packages/cms/src/types.ts
export type PageType = "home" | "category" | "marketing" | "search" | "pdp" | "location";
export type PageStatus = "draft" | "published";

/** A content-authored block a page references by type + config -- the composable building block every page type's content is made of. */
export interface ComponentInstance {
  componentType: string;
  config: Record<string, unknown>;
}

export interface Page {
  id: string;
  pageType: PageType;
  /** For "home", a fixed slug; for marketing pages, campaign-specific; category/search/pdp pages are typically keyed by their own domain id instead of a CMS slug. */
  slug: string;
  title: string;
  status: PageStatus;
  sections: ComponentInstance[];
}
```

Because `sections` is just an array of `{ componentType, config }`, adding a brand-new component
type is never a change to `Page` itself — it's a new entry in the component registry:

```ts
// packages/cms/src/component-registry.ts
export const DEFAULT_COMPONENTS: ComponentDefinition[] = [
  { type: "hero-banner", label: "Hero Banner", description: "A large top-of-page banner with image/copy/link." },
  { type: "ad-slot", label: "Ad Slot", description: "A promotional placement." },
  { type: "category-spot", label: "Category Spot", description: "A featured-category tile linking to a category page." },
  { type: "product-grid", label: "Product Grid", description: "A grid of products -- reused across category/marketing/search pages." },
  { type: "service-area-info", label: "Service Area Info", description: "Contact/hours/local marketing copy for a location page (subsystem 15) -- the structured phone/name/region live on the ServiceArea entity itself, this component is for richer authored content." },
];
```

`product-grid` is a good example of the "shared component vocabulary" idea: the exact same
component type renders a category page's product listing, a marketing page's curated set, and a
search page's results — theming decides how it's laid out, CMS just says "there's a product
grid here, with this config."

Here's a real seeded home page — the actual seed data the `print-shop` demo storefront loads on
first run:

```ts
// apps/reference-storefront/lib/seed.ts
const home = await cms.createPage({
  pageType: "home",
  slug: "home",
  title: "Home",
  sections: [
    {
      componentType: "hero-banner",
      config: {
        headline: "The Print Shop",
        subheadline: "Embroidery, custom coasters, apparel, and drinkware -- personalized to order. New drops every season.",
      },
    },
    {
      componentType: "category-spot",
      config: { categorySlugs: ["embroidery", "custom-coasters"] },
    },
    {
      componentType: "ad-slot",
      config: {},
    },
  ],
});
await cms.publishPage(home.id);
```

That's the whole authoring model: a hero, a couple of featured categories, and an ad slot,
described declaratively and rendered by whichever layout template theming currently has
registered as the default for the `home` page type.

## Marketing pages: campaign content with its own mini-catalog

A CMS **marketing page** is deliberately distinct from a standing category — it's a time-boxed
campaign (a seasonal sale, a Halloween special) with its own curated, *ordered* product list
that CMS owns directly, not a reference into the category taxonomy:

```ts
// packages/cms/src/types.ts
export interface MarketingPageMeta {
  pageId: string;
  campaignName: string;
  /** ISO date string. */
  startDate: string;
  /** ISO date string, or null for an open-ended campaign. */
  endDate: string | null;
  /** Ordered, curated -- NOT a set. Display order is authoring intent. */
  productIds: string[];
}
```

And the real seed data creating one, immediately after the home page above:

```ts
// apps/reference-storefront/lib/seed.ts
const toteId = productIdBySlug.get("embroidered-canvas-tote");
const { page: campaign } = await cms.createMarketingPage({
  slug: "fall-sale",
  title: "Fall Sale",
  sections: toteId ? [{ componentType: "product-grid", config: { productIds: [toteId] } }] : [],
  campaignName: "Fall Sale 2026",
  startDate: "2026-10-01",
  // ...
});
```

Notice the campaign's `sections` (a `product-grid` component instance) and its
`MarketingPageMeta.productIds` are two different lists serving two different purposes: sections
say what renders on the page, while the meta's `productIds` is the structured, queryable
curation data — the thing an AI/MCP tool or an admin report could read without parsing page
content. `createMarketingPage` writes both atomically:

```ts
// packages/cms/src/service.ts
async createMarketingPage(input) {
  const page: Page = {
    id: randomUUID(),
    pageType: "marketing",
    slug: input.slug,
    title: input.title,
    status: "draft",
    sections: input.sections,
  };
  await pages.save(page);

  const meta: MarketingPageMeta = {
    pageId: page.id,
    campaignName: input.campaignName,
    startDate: input.startDate,
    endDate: input.endDate,
    productIds: input.productIds,
  };
  await marketingMeta.save(meta);

  return { page, meta };
}
```

## Marketing catalog: the standing taxonomy catalog itself never knows about

The [marketing catalog](/subsystems/02-marketing-catalog) subsystem is what the framework's
founder called the missing piece in every free/OSS commerce option evaluated before building
this one: a real category taxonomy — "Toys → Kids → Legos" — layered *on top of* the product
catalog, without the product catalog ever knowing categories exist. Product-to-category
assignment is a many-to-many join owned entirely by this subsystem, not a field on `Product`
itself:

```ts
// packages/marketing-catalog/src/service.ts
export interface MarketingCatalogService {
  createCategory(input: NewCategoryInput): Promise<Category>;
  listChildCategories(parentId: string | null): Promise<Category[]>;

  assignProductToCategory(productId: string, categoryId: string): Promise<void>;
  unassignProductFromCategory(productId: string, categoryId: string): Promise<void>;
  listCategoriesForProduct(productId: string): Promise<Category[]>;
  listProductIdsInCategory(categoryId: string): Promise<string[]>;

  suggestCategories(productId: string): Promise<CategorySuggestion[]>;
}
```

`suggestCategories` is assistive, not authoritative — it looks at a product's full attribute map
(from catalog) and suggests likely categories a merchandiser can accept or override, never an
auto-assignment a human can't see coming. The subsystem's own decoupling test is the cleanest
one in the repo: delete marketing catalog entirely and the product catalog still works, you just
lose browsing and curation — never product data integrity.

## Search: a read-optimized copy, kept in sync by events

[Search](/subsystems/03-search) is the page the founder flagged as "a big one" — query, filter,
and facet behavior over products, backed by a pluggable index adapter (a zero-infra default
ships in-repo; Solr/Elasticsearch/Algolia/Meilisearch are swap-ins). The important architectural
choice is that search never queries catalog directly at request time. It maintains its own
denormalized index, kept current purely by subscribing to `catalog.product.*` and
`catalog.sku.*` events — the same event-bus decoupling this framework leans on everywhere else,
applied here so that swapping search backends is a config change, not a data migration. Facet
configuration is driven by catalog's own `ProductAttribute.facetable` flags rather than a
separate, hand-maintained facet format.

## Service areas: location pages for a business that isn't shippable-anywhere

[Service areas](/subsystems/15-service-areas) exist for a real, concrete need: a business like
home-automation installer All That Technology operates in specific cities, not "anywhere in the
US," and needs a real page per location — not a shippable-goods category. A `ServiceArea` is a
standing, structured entity (`slug`, `name`, `region`, `phone`) with its own many-to-many
product assignment, mirroring marketing catalog's category-assignment join exactly:

- **Data** lives on the `ServiceArea` entity (queryable — "what's the phone number for the Royse
  City location" is a real question an AI/MCP tool can answer directly from structured data).
- **Page rendering** goes through CMS's `location` page type, using the same `sections`/
  component-instance model as every other page type — richer marketing copy (hours, a map
  embed) belongs there, not on the structured entity.

The Northline reference demo makes this real rather than illustrative: its seed data
(`apps/reference-storefront/lib/seed-northline.ts`) assigns "Fiber Internet Installation" to
only 5 of 8 seeded service areas (the ones with fiber infrastructure) while "TV Wall Mounting"
is assigned to all 8 — and each of those 8 areas has its own published CMS location page whose
services-offered list is computed directly from that join, never hand-typed per page.

## Further reading

- [Subsystem 05 — CMS (5 page types + components)](/subsystems/05-cms-pages)
- [Subsystem 02 — Marketing Catalog](/subsystems/02-marketing-catalog)
- [Subsystem 03 — Search](/subsystems/03-search)
- [Subsystem 15 — Service Areas (Location Pages)](/subsystems/15-service-areas)
