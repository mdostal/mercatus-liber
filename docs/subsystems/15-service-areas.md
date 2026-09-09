# Subsystem 15 — Service Areas (Location Pages)

## Purpose
The multi-location marketing pattern a real service-area business needs (per Mathew's explicit
ask, 2026-09-08: "ensure we can make the location based pages for service area" — grounded in
client All That Technology's real shape: Royse City TX, 8 core cities, home-automation installs
that are inherently local, not shippable-anywhere goods). A **service area** (a city/region a
business operates in) is a standing, structured entity — distinct from a product category
(marketing-catalog, 02) and distinct from a CMS page (05), same "data vs. page layout" split
those two subsystems already established between each other.

## Depends on
`@core/schema` types, and `catalog` (01) **read-only**, via the narrowest structural interface
needed for product<->area assignment lookups. Never writes to catalog; catalog never imports
this package — same one-directional dependency rule as marketing-catalog (02).

## Responsibilities
- CRUD for `ServiceArea`: `id`, `slug`, `name` (e.g. "Royse City, TX"), `region`, `description`,
  `phone` (nullable).
- Many-to-many product<->service-area assignment (a join owned entirely by this package, mirrors
  marketing-catalog's `ProductCategoryRepository` exactly) — real now, not just illustrative: the
  Northline reference demo's `lib/seed-northline.ts` assigns "Fiber Internet Installation" to only
  5 of its 8 service areas (the ones with fiber infrastructure) while "TV Wall Mounting" is
  assigned to all 8, and each of those 8 areas now has a real, distinct, published CMS location
  page (epic `demo-store-northline-depth`) whose `servicesOffered` list is computed directly from
  this join, not hand-typed.
- Nothing about page layout/rendering — that's CMS's job via a new `location` page type (05),
  the exact same split marketing-catalog already has with CMS's `category` page type.

## Explicitly NOT this subsystem's job
- Location page rendering/layout (CMS, 05, via the new `location` page type).
- Being a product category — a service area answers "where," a category answers "what kind."
  A product can independently belong to both.
- Geolocation/mapping/routing logic (distance calculations, "nearest location" lookups) — out of
  scope for a reference implementation; `region`/`description` are free-text fields a deployment
  can enrich however it needs.

## Decoupling notes
Same test as marketing-catalog: delete this subsystem entirely and the product catalog still
works — you just lose location-based browsing/curation, not product data integrity.

## Open questions
1. Should a service area support a hierarchy (e.g. "Texas" → "Royse City" → a specific
   neighborhood), mirroring marketing-catalog's category tree? Start flat (no `parentId`) —
   real-world service-area businesses (ATT's 8 core cities) don't obviously need one, and it's
   easy to add later without a breaking change (an optional nullable field).
2. Should `ServiceArea` carry its own contact info (`phone`) or should that live entirely in the
   CMS page's `sections` config (a `service-area-info` component)? Resolved: `phone` lives on the
   structured `ServiceArea` entity (queryable/reusable data, e.g. for a locations index page or
   an AI/MCP tool answering "what's the phone number for the Royse City location"), while
   richer marketing copy (hours, a map embed, testimonials) belongs in the CMS page's sections —
   same split as everywhere else in this repo.
