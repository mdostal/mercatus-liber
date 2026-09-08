# Subsystem 02 — Marketing Catalog (Categories)

## Purpose
The layer the founder specifically called out as the missing piece in every free/OSS option
evaluated: a **marketing catalog built on top of the product catalog**, distinct from it —
top-level categories and lower-level categories (e.g. "Toys → Kids → Legos") that curate and
present products for browsing/merchandising, without being the product data itself.

## Depends on
`@core/schema` types, and `catalog` (01) **read-only** via `ProductRepository`. Marketing
catalog never writes to catalog, and catalog never imports marketing catalog — the dependency
is one-directional.

## Responsibilities
- CRUD for `Category` (extends `CategoryRef` from core): hierarchical, arbitrary depth, a
  category has a parent (nullable for top-level) and a title/slug/description.
- Assigning products to one or more categories (a many-to-many join, owned by this subsystem —
  NOT a field on `Product` in core, keeping catalog ignorant of categories entirely).
- **Attribute-based suggestion:** given catalog's full attribute map (00/01), suggest or
  auto-assign likely categories for a product (e.g. a product with `material: "PLA"` and
  `printer_compatible: true` suggests a "3D Printing" category) — this is assistive tooling,
  never a hard requirement; a human can always override.
- Category-level metadata used by the CMS category page (subsystem 05): featured products,
  category banner image ref, sort order — but the actual page *layout* is CMS's job, this
  subsystem just supplies the data.

## Explicitly NOT this subsystem's job
- Category page rendering/layout (CMS, 05).
- Deciding what counts as "marketing" content like a Halloween special — that's a **Marketing
  Page** (a CMS page type, 05) which has its *own* mini catalog concept (a curated product set
  tied to an event/campaign), separate from the general category hierarchy here. Categories are
  the standing, evergreen taxonomy; marketing pages are time-boxed campaigns that can pull from
  categories or hand-pick products directly.

## Decoupling notes
This is the clearest illustration of the "sales catalog vs. marketing catalog" separation that
motivated the whole project: `catalog` (01) never knows categories exist. Delete this entire
subsystem and the product catalog still works — you just lose browsing/curation, not product
data integrity. That's the test.

## Open questions
1. Can a product belong to categories in more than one hierarchy (e.g. a "by audience" tree
   AND a "by material" tree simultaneously), or is category assignment single-hierarchy only?
2. Attribute-based suggestion — rule-based (if attribute X then suggest category Y, configured
   per-deployment) or something smarter later? Start rule-based; don't over-build.
3. Should category-to-category relationships beyond parent/child exist (e.g. "related
   categories") or is that purely a CMS-page concern layered on top?
