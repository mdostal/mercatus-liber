# Design Discussion: demo-store-print-shop-rebrand

## 0. Context

Backlog epic 36. User's explicit ask: "change dragon merch to the print shop or something and
have it focus on embroidery, custom designs like coasters, etc." — a genuine business-concept
change, not a rename-in-place. Depends on epic 34 (done — switchable themes) and follows the
same nav-depth pattern epic 35 (done) just proved for Northline.

## 1. Design questions

**(a) Same slug with new content, or a genuine slug rename?**
Resolved: **genuine rename**, `dragon-merch` → `print-shop`, across `DEMO_SLUGS`/
`DEMO_REGISTRY` and every real code/doc reference (confirmed by grep: 20 files reference
`dragon-merch` today — a bounded, mechanical scope, not sprawling). Reasoning: the user said
"change," not "add a new one alongside it," and a URL slug that says `dragon-merch` while the
store is branded and sells as "The Print Shop" is a real, permanent, user-visible mismatch —
worse than the one-time cost of a clean rename. This is NOT the same decision as epic 37 (a
genuinely new, third demo store gets a new slug because it IS new).

**(b) Product personalization (custom text/embroidery on an order) — full subsystem, or scoped down?**
Resolved, per `VISION.md`'s own explicit framing: "product personalization / customizer" is
listed there as a **wanted-but-not-started, community-contributable** subsystem (design-asset
uploads, per-line customization state, its own data model) — building that in full here would
contradict this project's own just-published community-plugin-frontier stance. **Scoped down**:
one small, additive, optional field on a cart line — `customizationNote?: string` (free text,
e.g. "Text: Sarah — thread color: navy") — captured at add-to-cart time on the PDP for products
flagged as customizable, stored on the cart line, shown at every stage through checkout/order
confirmation. This is enough to make an embroidery/coasters demo genuinely feel real (a shopper
can actually specify their customization) without inventing a new subsystem, design-asset
storage, or a review/approval workflow — all explicitly left as the "wanted, not started" item
in `VISION.md` for a real community-built `product-personalization` subsystem later.

**(c) Per-demo default theme — in scope here?**
A related, small, genuinely useful fix found during research: no mechanism exists today for a
demo to have its own default `ThemeBundle` — `readActiveThemeBundle()` always falls back to
`THEME_BUNDLES[0]` ("classic") until a shopper manually switches. This directly serves the
"these aren't themed, integrated" complaint (a themed store that opens looking generic until a
visitor finds the switcher is not "integrated"). **In scope, small and additive**: add an
optional `defaultThemeKey` to each `DemoDefinition` in `lib/demos.ts`; `readActiveThemeBundle`
falls back to the demo's configured default (if any) before falling back to `THEME_BUNDLES[0]`.
print-shop defaults to `editorial` (the warm artisan-market bundle — the closest fit for a
hand-crafted embroidery/coasters shop). This also retroactively fixes Northline, which never
had a real default either — Northline gets `defaultThemeKey: "northline"`, its own existing
bundle, finally actually applied by default. dragon-merch/print-shop and Northline both keep
working exactly as before for any visitor who has already picked a theme via the switcher
(cookie always wins).

## 2. Scope assessment

**Medium-large.** A genuine slug rename (mechanical but real, ~20 files), a full seed-data
replacement (new business concept, several categories), one small additive cart-line field
threaded through add-to-cart → cart → checkout → order confirmation, and the small
default-theme addition. No new subsystem, no schema migration beyond the one optional field.

## 3. Stories

1. **slug-rename-and-registry** — pure mechanical rename `dragon-merch` → `print-shop`
   throughout the codebase (registry, tests, docs, README, any hardcoded references found by
   the grep above), confirmed by a final repo-wide grep returning zero live references (deliberate
   historical/changelog mentions of the old name in past epic-backlog rows are expected and
   correct to leave alone — those are history, not live code). The OLD dragon-merch product
   content stays in place under the new slug for this story only — new content is story 2's job,
   kept separate so this story is a clean, independently-verifiable rename.
2. **print-shop-catalog-and-personalization** — replace the (now print-shop-slugged) demo's
   entire seed catalog with real embroidery/custom-print goods across several real categories
   (Embroidery, Custom Coasters, Apparel, Drinkware — real product names/descriptions/prices,
   no lorem ipsum), add the `customizationNote` cart-line field end-to-end (PDP flag + input →
   cart line → checkout → order confirmation), add the `defaultThemeKey` mechanism from §1c and
   set print-shop to `editorial` / Northline to `northline`. Real nav categories should "just
   work" via epic 35's already-built demo-aware `navLinks` mechanism once real categories exist
   — no new nav code needed, but this story must confirm that's actually true, not assume it.
3. **verification-and-closeout** — live-verify the renamed slug end-to-end (old
   `/demo/dragon-merch` routes are genuinely gone, `/demo/print-shop` is the real live route),
   the new catalog/nav, a full add-to-cart-with-customization-note → cart → checkout path, both
   demos' new default themes actually apply on a fresh (no-cookie) visit, update docs/README
   references, close out the backlog row, merge to master.

## 4. Risks

- **Medium** — a slug rename touches test fixtures and possibly hardcoded assumptions
  elsewhere in the codebase beyond the 20 grep-found files if any are missed. Mitigation:
  story 1's acceptance criteria requires a final zero-live-references grep as hard proof, not a
  best-effort pass.
- **Low** — `customizationNote` is a genuinely new field threaded through several layers (PDP →
  add-to-cart action → cart line → checkout → order). Mitigation: additive/optional everywhere,
  same low-risk pattern as prior additive fields in this project's history (e.g. `Order.createdAt`).

## 5. Open questions

None blocking.
