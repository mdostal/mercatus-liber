# open-source-commerce _(working name — see `docs/NAMING-CANDIDATES.md`)_

A free, MIT-licensed, headless commerce framework: schema-first product/SKU catalog with
pluggable database adapters, a **marketing catalog genuinely separate from the sales
catalog** (the gap no existing free/OSS commerce platform actually fills), a per-page CMS
instead of forced whole-site theming, a long-lived cart, adapter-based payments (Stripe first),
analytics on by default (PostHog, config-swappable), and a plugin system for everything else
(OMS, fulfillment, notifications).

Built as an **AI *and* human commerce tool from the ground up** — every capability exposed to a
human storefront/admin UI is equally exposed to AI agents via a documented skills/tool catalog
and an MCP server, calling the exact same subsystem interfaces. No shadow API, no reduced
agent-only surface.

**Status:** pre-alpha — architecture and subsystem planning phase, no code yet.

## Why
Evaluated against every serious free/OSS option (Medusa, Saleor, Vendure, Spree/Solidus,
Shopware, Bagisto, Sylius) plus proprietary options (Snipcart, Swell) for
[shop.mdostal.com](../shop) — a small maker shop needing a real multi-item cart. None fit: wrong
stack, wrong deploy shape, unnecessary infrastructure for a small catalog, or not actually free.
See [`shop/.pHive/epics/v1-launch/docs/oss-cart-cba.md`](../shop/.pHive/epics/v1-launch/docs/oss-cart-cba.md)
for the full CBA that led here.

`shop.mdostal.com` becomes this project's first real reference deployment once packages exist
here to consume.

## Read next
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — design principles, subsystem map, repo shape.
- [`docs/subsystems/`](docs/subsystems/) — one doc per subsystem (13 total), each covering
  purpose, dependencies, responsibilities, explicit non-responsibilities, and open questions.
- [`docs/NAMING-CANDIDATES.md`](docs/NAMING-CANDIDATES.md) — 50 candidate project names.

## Prime directive
No subsystem imports another subsystem's internals. Everything talks through shared core
types, adapter interfaces, or a typed event bus. See `docs/ARCHITECTURE.md` → "Prime directive:
no tight coupling" for the test used to catch violations.

## License
MIT — see [`LICENSE`](LICENSE). Give it away.
