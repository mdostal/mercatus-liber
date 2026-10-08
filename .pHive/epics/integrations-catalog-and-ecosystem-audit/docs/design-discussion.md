# Design discussion: integrations-catalog-and-ecosystem-audit (epic 77)

## 1. Why this epic, and why now

Explicit user ask, 2026-10-07, after being asked to clarify an earlier vague "integrations"/
"the tools" instruction: "We need to call out and deal with all the integrations we've built
(sanity cms, shippo etc) and we need to increase them and dig into what else should exist and
what is necessary as part of the ecosystem to help that build out more."

Verified directly before planning, not assumed: **12 real adapter packages exist today**
(`adapter-clerk`, `adapter-cloudinary`, `adapter-convex`, `adapter-mongodb`, `adapter-postgres`,
`adapter-postgres-inventory`, `adapter-printful`, `adapter-printify`, `adapter-sanity`,
`adapter-shippo`, `adapter-shopify`, `adapter-sqlite`), plus built-in provider integrations
inside non-adapter-named packages (`analytics` → PostHog/GA4, `payments` → Stripe). **Zero
single page or doc catalogs them.** A repo-wide search for "integration" turns up only test
filenames and unrelated story IDs — nothing a prospective adopter or contributor can read to
answer "what does this framework actually integrate with today, and what's the real live
status of each." `.pHive/planning/epic-backlog.md` has the real, honest status of every one of
these scattered across 76 rows of epic history — accurate, but not something anyone would
reasonably read end-to-end to answer a simple integrations question.

Separately, `VISION.md`'s existing "Wanted, not started — the community plugin frontier"
table (from epic 47) already catalogs *feature* gaps (wishlist, subscriptions, loyalty, etc.)
verified against real Shopify/BigCommerce/WooCommerce documentation. This epic does the
equivalent exercise specifically for *integration/provider* gaps — a distinct axis (not
"what features are missing" but "what third-party systems should this framework be able to
talk to that it can't yet").

## 2. Scope

**In scope:**
1. A real, comprehensive Integrations catalog — one canonical page, grounded in the actual
   code (every adapter package, what it wraps, its real current status: live in production
   today / built+tested but credential-gated / not yet live-verified), cross-referenced
   against `epic-backlog.md`'s own disclosed states so nothing is overstated or understated.
   Lives on the docs site (`apps/docs`) as its own page, with a short summary + link from
   `README.md`.
2. A fresh gap audit, same real-research discipline as epic 40 (web-verified against real
   competitor documentation, not guessed): what integration *categories* does a serious
   commerce platform need that this framework doesn't have an adapter for at all yet? Real
   candidates to verify, not assume: tax calculation (TaxJar/Avalara-class), accounting/ERP
   sync (QuickBooks/Xero-class), email/SMS marketing beyond the existing analytics-only
   PostHog/GA4 pair, a marketplace-channel sync (Amazon/eBay-class), a webhook/automation
   layer (Zapier-class), a second payment processor beyond Stripe (PayPal/Braintree-class),
   a loyalty/rewards provider. Each real finding gets disposed of the same way prior audits
   in this repo have: fixed directly if small, written up as a real new-epic-candidate if
   not, or explicitly marked "deliberately not core" if it belongs on the community-plugin
   frontier table already in `VISION.md` (don't duplicate that table, cross-reference it).
3. Explicitly OUT of scope: the Shopify migration/import tool itself — that's real,
   substantial, separate work, planned as its own epic (`shopify-migration-import-tool`,
   epic 78) since it's a different shape of work (building a new capability, not cataloging/
   auditing existing ones) and deserves its own scope boundary.

## 3. Real current adapter inventory (source of truth for story 1, verified via `ls packages/`)

| Package | Wraps | Real status (per epic-backlog.md, re-verify at execution time) |
|---|---|---|
| `adapter-sqlite` | SQLite | Live, reference default |
| `adapter-postgres` | Postgres/Supabase | Live (print-shop, northline) |
| `adapter-postgres-inventory` | Postgres (inventory-specific) | Live |
| `adapter-mongodb` | MongoDB Atlas | Built, tested, blocked live on Atlas Network Access (epic 57) |
| `adapter-convex` | Convex | Live (broadleaf) |
| `adapter-shopify` | Shopify (as a live backend) | Live-wired, credential-gated for a real store |
| `adapter-sanity` | Sanity CMS | Live in production (all 3 demos) |
| `adapter-clerk` | Clerk (admin auth) | Live in production |
| `adapter-cloudinary` | Cloudinary (image CDN) | Built, credential-gated, not live |
| `adapter-printful` | Printful (print-on-demand fulfillment) | Built, credential-gated, not live |
| `adapter-printify` | Printify (print-on-demand fulfillment) | Built, credential-gated, not live |
| `adapter-shippo` | Shippo (shipping rates/labels) | Built, credential-gated, not live |
| `payments` (built-in) | Stripe | Live-wired, sandbox default when unset |
| `analytics` (built-in) | PostHog | Live in production |
| `analytics` (built-in) | GA4 Data API | Built, credential-gated, not live |

This table is a starting point for story 1, not the final deliverable — the story must
re-verify every row against real code/real epic-backlog.md state at execution time, not
copy this table blindly (it could drift between planning and execution).

## 4. Risks

| Risk | Mitigation |
|---|---|
| Catalog goes stale immediately like every other "status" doc in this repo has | Ground it in a repeatable verification method (grep real packages, cross-reference epic-backlog.md), and note in the doc itself when it was last verified |
| Gap-audit finds something and the epic tries to build it all in one pass, scope-creeping into a mega-epic | Explicit disposal categories per finding (fix-now-if-small / new-epic-candidate / deliberately-deferred), same discipline as prior gap audits |
| Duplicating VISION.md's existing community-plugin-frontier table | Explicit cross-reference, this epic covers *integrations* (third-party systems), not *features* |

## 5. Scale assessment

**Medium.** Documentation + a real research-grounded audit, no new subsystems, no new core
schema. Proceeding directly to stories, matching this session's established Medium-scope
precedent.
