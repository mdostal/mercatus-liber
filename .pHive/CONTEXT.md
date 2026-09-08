# CONTEXT.md — domain glossary

Seeded from the architecture pass (`docs/ARCHITECTURE.md` + `docs/subsystems/*.md`) rather than
scaffolded empty, since the vocabulary is already stable. Update as it evolves.

## Terminology
- **Product** — the conceptual thing being sold (e.g. "Dragon Cable Organizer").
- **SKU** — a concrete, purchasable variant of a Product, defined as a combination of
  **identifying attributes** (e.g. color, size) set dynamically per product.
- **Identifying attribute** — an attribute whose values fork a Product into distinct SKUs.
- **Full attribute map** — a Product's broader, descriptive/facetable attributes, separate from
  identifying attributes, feeding search/filter UIs.
- **Marketing catalog** — the category hierarchy layered on top of the product catalog,
  genuinely separate from it (the gap this project exists to fill). See subsystem 02.
- **Marketing page** — a time-boxed campaign/special (e.g. "Halloween") with its own curated
  mini-catalog, distinct from the standing category taxonomy. See subsystem 05.
- **Adapter** — a concrete implementation of a core interface (DB persistence, payments, search
  index, inventory/IMS) that a deployment swaps in without touching the subsystem that depends
  on it.
- **Event bus** — the typed pub/sub mechanism subsystems use for side-effecting, cross-subsystem
  reactions (e.g. `checkout.order.placed`), instead of direct calls.
- **Subsystem** — one independently-packaged unit of the architecture (13 total); see the
  subsystem map in `docs/ARCHITECTURE.md`.

## Key paths
- `docs/ARCHITECTURE.md` — prime directive, repo shape, subsystem map.
- `docs/subsystems/00-core-schema.md` through `12-plugins-extensibility.md` — one doc per
  subsystem.
- `docs/NAMING-CANDIDATES.md` — 50 candidate project names, unresolved.
- `../shop/.pHive/epics/v1-launch/docs/oss-cart-cba.md` (sibling repo) — the CBA that motivated
  this project.

## Conventions
- No subsystem package imports another subsystem's internals (the prime directive — see
  `.pHive/cross-cutting-concerns.yaml` → `subsystem-decoupling`).
- Every persistence need is expressed as a repository interface against core schema types;
  concrete DB adapters (Postgres, SQLite reference implementations) live in their own packages.

## Canonical references
- `docs/ARCHITECTURE.md`
- `docs/subsystems/`
