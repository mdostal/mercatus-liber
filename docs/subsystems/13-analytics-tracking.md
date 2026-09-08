# Subsystem 13 — Analytics & Tracking

## Purpose
Analytics is a plugin by construction, not a bolt-on: every subsystem already publishes
semantic events to the event bus (00) for its own reasons (inventory reacting to orders,
account reacting to order status, etc.). This subsystem's entire job is to **subscribe to that
same event stream** and forward it to a configurable analytics adapter — so adding analytics
never requires touching another subsystem's code, and swapping analytics providers never
requires touching this subsystem's event-emitting callers. **Ships enabled by default with a
PostHog adapter**, per the founder's spec ("by default roll posthog, but when you add the
analytics it should automatically get the events from those other systems").

## Depends on
`@core/schema`, the event bus (00) — read-only subscriber to everything. No subsystem depends
on analytics; analytics depends on (subscribes to) all of them, one-directionally, which is why
it's numbered last among the "backend" subsystems.

## Responsibilities
- `AnalyticsAdapter` interface: `track(eventName, properties, context)`,
  `identify(userId, traits)`, `page(name, properties)` — the shape most analytics SDKs
  (PostHog, Segment, Mixpanel, Amplitude, GA4) already converge on, so wrapping any of them is a
  thin adapter, not a redesign.
- **Server-side collection:** subscribes to every existing event-bus topic
  (`catalog.product.*`, `cart.item.*`, `checkout.order.*`, `inventory.stock.*`, etc.) and maps
  each to an analytics `track()` call. New subsystem events get picked up automatically as long
  as they're published on the bus — this subsystem doesn't need a code change per new event
  type, just a naming-convention-aware mapper (or an explicit allow-list, see open questions).
- **Client-side collection:** a lightweight `trackEvent()` helper the storefront UI (PDP, CMS
  pages, search results) calls directly for interaction/impression events that never touch the
  backend at all (product viewed, search performed, page viewed, add-to-cart *click* vs. the
  add-to-cart *event* cart (07) publishes once it actually succeeds). Client and server paths
  both terminate at the same `AnalyticsAdapter` interface.
- The PostHog reference adapter ships enabled by default; disabling analytics entirely, or
  swapping to a different adapter (Segment, GA4, a self-hosted option, a no-op adapter for
  privacy-conscious deployments), is a config change, not a code change.

## Explicitly NOT this subsystem's job
- Deciding what counts as a meaningful business event (each subsystem names and publishes its
  own events; analytics doesn't invent new business semantics, it observes existing ones).
- Being a dependency of any other subsystem (same directional rule as plugins, 12 — analytics
  can be deleted entirely and nothing else breaks).

## Decoupling notes
This is the cleanest possible proof of the event-bus design paying for itself: analytics is
~100% "subscribe to what already exists," not "instrument every subsystem specifically for
analytics." If a subsystem's event isn't showing up in analytics, the fix is either the
event-name mapping here, or that subsystem didn't publish the event in the first place — never
a change to how the subsystem itself works.

## Open questions
1. Event mapping: allow-list (explicit, safer, more setup) vs. automatic pass-through of every
   bus event by naming convention (zero setup, risk of leaking noisy/internal events into
   analytics)? Lean allow-list with sane defaults pre-configured for the obvious commerce
   events (product viewed, added to cart, checkout started, order placed).
2. PII handling — does this subsystem own any scrubbing/redaction policy, or is that entirely
   the adapter/provider's responsibility (e.g. PostHog's own PII controls)?
3. Server-side vs. client-side event de-duplication (e.g. "product viewed" fired by both a
   server-rendered page load and a client hydration event) — needs a documented convention
   before the first two adapters (PostHog + one other) are built, or every adapter reinvents it.
