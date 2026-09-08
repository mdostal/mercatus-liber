# Epic 15b — public demo: brand and scope

Epic 15's public, obfuscated variant (per Mathew's 2026-09-08 correction: this proves the same
service-area/home-automation feature set as a giveaway example, with a **fictional** identity --
never All That Technology's real name/branding/content, which is 15a's strictly-internal
variant instead).

## The fictional identity

**Northline Home Tech** -- a professional smart-home installation service (TV mounting, security
camera install, video doorbell install, fiber internet install, home theater setup), operating
across several demo service areas. Same conceptual category as a real home-automation installer
(the category proof this epic needs to demonstrate), a distinctly different name, city list, and
visual identity from All That Technology.

- **Logo concept:** a simple compass/arrow mark ("north" -- alignment, precision, "we get it
  pointed the right way") paired with a clean sans-serif wordmark. No actual image asset is
  produced by this epic (that's a graphic-design task, not an engineering one) -- the theme
  bundle's tokens and the 🧭 emoji stand in for it in the reference UI, same low-fidelity-brand-
  mark approach the existing 6 themes and the dragon-shop's 🐉 emoji already use.
- **Palette:** indigo-blue primary (`#1e40af`) + amber accent (`#f59e0b`) on a light slate
  background -- a professional, trustworthy "on-site technician" feel, deliberately distinct
  from every existing bundle's palette (verified: no token collides with any of the other 6).
- **Demo service areas:** 8 fictional/generic city placements (not All That Technology's real 8
  cities) -- proves the multi-location pattern at the same scale without touching real client
  geography.

## What this epic builds

1. A 7th theme bundle (`northline`) in `packages/theming` -- real code, same shape as the
   existing 6, not a special case.
2. A second, env-var-selectable seed path in `apps/reference-storefront`
   (`DEMO_BRAND=northline`, default remains the existing dragon-merch seed -- zero behavior
   change for the existing default/tests) seeding Northline's services as catalog products, 8
   service areas via the service-areas subsystem (with per-area product assignment, not
   all-or-nothing), a CMS home page styled with the `northline` bundle, and a couple of
   location pages.

Reusing `apps/reference-storefront` rather than building a fourth parallel app: every other
subsystem this epic needs to "double check across the board" (admin UI, AI/MCP interface,
analytics, plugins, CMS rendering) is already fully wired there and doesn't hardcode anything
about the dragon-merch seed -- switching the seed data proves all of it works for a completely
different real-world vertical with **zero additional subsystem code**, which is a stronger
give-away-example story than a fourth, mostly-duplicate app would be ("the same reference app,
re-seeded and re-themed, becomes a different real business").

## Disclosed gaps

- No real logo image asset (a design task, not an engineering one -- see above).
- No production deploy of the Northline variant -- it is a seed-data path in the existing
  reference storefront, runnable locally exactly like the existing dragon-merch default, not a
  separately hosted instance.
