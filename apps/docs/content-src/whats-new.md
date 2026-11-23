# What's new

The latest release is **[v0.58.0](https://github.com/mdostal/mercatus-liber/releases/tag/v0.58.0)** (2026-11-23), the first tagged
release. The full list is in the [CHANGELOG](https://github.com/mdostal/mercatus-liber/blob/master/CHANGELOG.md).

## Scheduled lines and sale windows

Products and SKUs take a sale window (`activeFrom`, `activeTo`), and cart and checkout refuse
anything outside it. A **line** is a sales catalog with its own schedule, hero, sections and
landing page, so a store can run limited drops: "Holiday Week One, open Monday noon to Monday
noon".
- **Scoped features:** search, promotions and sales reports all work per line.
- **Product pages:** a `SaleWindow` badge counts down to opening or closing.
- **Marketing tiles:** homepage tiles link into a line with `icid` tracking.

Packages: [catalog](/packages/catalog), [storefront-ui](/packages/storefront-ui),
[promotions](/packages/promotions), [internal-bi](/packages/internal-bi),
[store-api](/packages/store-api).

## Printful catalog browser

Browse all of Printful's products from the admin and bring one into the store. Then:
- Place art on each print area at the right size.
- Generate mockups.
- Publish once every placement has art.

It works offline from a snapshot when there's no Printful token. Agents get the same steps as
tools. Packages: [adapter-printful](/packages/adapter-printful), [admin-ui](/packages/admin-ui),
[media](/packages/media).

## Abandoned-checkout recovery

**Turned on in the Stripe adapter**, recovery works like this:
- **A recovery link:** an expired Stripe checkout gets a link that reopens it.
- **A reminder event:** the order becomes `abandoned`, and `checkout.order.abandoned` fires once.
- **Consent rules:** `canRemind` is true only when the shopper agreed to marketing email.
- **Freed stock:** abandoned orders give their reserved stock back.

Paid orders record the buyer's marketing consent, and a store can set the name shown on card
statements. Packages: [payments](/packages/payments), [checkout-orders](/packages/checkout-orders).

## Measured products

Products built to the buyer's own measurements (a clip sized to their bed rail, say) declare the
settings a buyer fills in, with ranges, choices, defaults and how-to-measure help. The
customization service checks what the buyer sent, and the print order carries it. Package:
[customization](/packages/customization).

## Print shops and fulfillment

- **New providers:** adapters for X3D Studios, SimplyPrint and ShipStation.
- **Labels:** Shippo label buying and voiding for orders you ship yourself.
- **Status updates:** provider status webhooks become one order event.
- **Print art:** versioned print art and admin components for print coverage, art versions and
  option matrices.

## Sample stores stay up

A scheduled check loads every sample store's pages every 6 hours and opens an issue if one
fails. Current status: ![Sample stores](https://img.shields.io/github/actions/workflow/status/mdostal/mercatus-liber/sample-health.yml?branch=master&label=sample%20stores)
([runs](https://github.com/mdostal/mercatus-liber/actions/workflows/sample-health.yml)).
