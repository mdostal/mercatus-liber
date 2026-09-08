# Subsystem 05 — CMS (5 page types + components)

## Purpose
Per-page CMS, not whole-site theming (see theming, 06, for why that distinction matters). The
founder's spec names 5 major CMS-managed page types:

1. **Home page** — components: hero banner, ad slots, category spots, etc.
2. **Category page** — top-level and nested marketing-category pages (data from 02).
3. **Marketing page** — a special/deal/event (e.g. "Halloween") with **its own mini catalog**
   (a curated product set tied to the campaign) and its own page, distinct from the standing
   category taxonomy.
4. **Search page** — see 03 for the data side; this subsystem owns its ~3 default layout
   templates (list/grid/dense) as CMS-configurable.
5. **PDP** — see 04 for the data side; this subsystem (via theming, 06) owns its layout
   templates (tabbed-detail, long-scroll, etc.)

Cart/checkout/account pages exist too but are more transactional-flow than
marketing-CMS-editable — see subsystems 07/09/10 for whether/how much CMS-configurability they
need; default assumption is minimal (functional, not marketing-authorable).

## Depends on
`@core/schema`, `marketing-catalog` (02, for category pages), `catalog` (01, read-only, for
product data referenced by marketing pages/hero spots), `theming` (06, for actual
component/layout rendering).

## Responsibilities
- A page-content model per page type: what components exist on a Home page (hero, ad slot,
  category spot, ...), what a Marketing page needs (its own curated product list + campaign
  metadata: name, date range, banner), etc.
- CRUD for page content, versioning/draft-vs-published state (a marketing page for a future
  campaign should be authorable before it goes live).
- Component registry: hero banner, ad slot, category spot, product grid, etc. as composable
  building blocks a page's content model references by id/config, not by hardcoded template
  markup — the actual rendering of a given component is a theming (06) concern.
- **Marketing page's own mini catalog:** a curated, ordered product list scoped to that page/
  campaign, stored by this subsystem (not marketing-catalog, 02 — a Halloween special isn't a
  standing category, it's campaign content that happens to reference products).

## Explicitly NOT this subsystem's job
- Deciding what a hero banner *looks like* rendered (theming, 06 — this subsystem says "there
  is a hero banner here with this image/copy/link," theming says how that's laid out/styled).
- Owning category or product data (02/01) — this subsystem references them by id.

## Decoupling notes
Each of the 5 page types is its own content model within this subsystem, but they share the
same component-registry and theming-template mechanism — so a "3 default layout templates per
page type" isn't 15 hand-built things, it's the same layout-template primitive (06) applied to
5 different content shapes.

## Open questions
1. Marketing-page mini-catalogs — do they need their own attribute/facet behavior (mini-search
   within a campaign) or is a simple ordered list sufficient at v1?
2. Draft/scheduled/published/expired states for time-boxed marketing pages (auto-expire a
   Halloween page on Nov 1) — core CMS feature or a plugin (12)?
3. Component registry extensibility — can a plugin (12) register a brand-new component type
   (e.g. a review widget) without modifying this subsystem's code?
