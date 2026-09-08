# Subsystem 04 — Product Display Page (PDP)

## Purpose
Renders a single product for purchase: images, description, the identifying-attribute picker
(color/size/etc. → resolves to a SKU via catalog's options-on-a-page query), price, add-to-cart.
Ships with a **default layout plus a few configs**, per the founder's spec: a tabbed-info style
and an "eBay-style" long-scroll style, selectable per product or per deployment default.

## Depends on
`@core/schema`, `catalog` (01, read-only — product/SKU/attribute data and the variant-resolver
query), `theming` (06, for which layout template + component styling to use). Publishes an
`cart.item.add-requested` style event or calls the cart subsystem's public interface directly
(cart is a legitimate direct dependency here since "add to cart" is a synchronous user action
with an expected immediate result, not a fire-and-forget side effect — see cart doc, 07, for
the boundary reasoning).

## Responsibilities
- Resolve a product's available identifying-attribute combinations to a specific SKU as the
  shopper picks options (calls catalog's variant-resolver; does not reimplement that logic).
- Two+ default layout templates (tabbed-detail, long-scroll) as **theming-layer templates**,
  not hardcoded PDP logic — the PDP subsystem provides the data/behavior contract; theming (06)
  provides the actual template markup/components. This keeps "add a third PDP layout" a
  theming-layer change, not a PDP subsystem change.
- Out-of-stock / SKU-unavailable states, sourced from inventory (11) via a read interface (not
  an event — PDP needs current stock synchronously to render "add to cart" correctly).

## Explicitly NOT this subsystem's job
- Owning product data (catalog, 01).
- Owning the cart itself (07) — PDP triggers an add, cart owns cart state.
- Defining what layouts/themes exist (theming, 06) — PDP defines what data a layout template
  needs, theming defines how that data is presented.

## Decoupling notes
A deployment should be able to add a brand-new PDP layout template (theming, 06) without
touching this subsystem's code at all, as long as the template consumes the same data contract
this subsystem exposes.

## Open questions
1. **Resolved 2026-09-08 (epic 21, `bundles`, subsystem 17):** bundles are handled entirely at
   the app-composition layer for v1, not folded into this subsystem's own `PdpViewModel`/
   `ProductLookup` contract — the reference-storefront's product page composes
   `bundles.getBundleForProduct(product.id)` alongside its existing stock-lookup composition
   (same established pattern, same file) and renders a tier selector when a bundle exists.
   This data contract stays untouched; see `docs/subsystems/17-bundles.md` and
   `.pHive/epics/bundles/docs/design-discussion.md` §5 for the full resolution. Folding bundles
   directly into `PdpViewModel` remains a documented future option if a deployment needs it at
   larger scale.
2. Real-time inventory read at PDP render time — direct interface call (simplest) vs. a cached/
   event-driven stock snapshot (better at scale, more complexity)? Start with the direct call;
   the founder's own CBA explicitly said don't over-build for volume that isn't here.
