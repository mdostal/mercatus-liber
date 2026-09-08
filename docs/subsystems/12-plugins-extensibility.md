# Subsystem 12 — Plugins & Extensibility

## Purpose
The founder's "becomes plugins for more like your OMS and other systems at play as well and mix
it to Shopify" — where deeper integrations (order management systems, fulfillment, marketing
automation, review widgets, analytics) attach without becoming core-subsystem dependencies.

## Depends on
`@core/schema` and the **event bus** (00) — that's the entire surface a plugin gets by default.
A plugin may additionally declare a dependency on a specific subsystem's public interface (e.g.
a plugin that adds a new CMS component type depends on the CMS component registry, 05), but
never on another subsystem's internals.

## Responsibilities
- Plugin registration/lifecycle contract: how a plugin declares itself, what it can subscribe
  to (any event), what extension points exist (CMS component registry, payment adapter
  registry, inventory adapter registry — anywhere this project already defined an adapter
  interface is itself a plugin point).
- A reference plugin or two (once core subsystems exist) proving the extension points actually
  work for something real — e.g. an order-notification plugin (subscribes to
  `checkout.order.placed`, sends an email/Slack message) or a basic OMS-sync plugin stub.

## Explicitly NOT this subsystem's job
- Being a dependency of any core subsystem — core subsystems must never import from `plugins`;
  the relationship is strictly plugins depending on core interfaces, never the reverse. This is
  the one direction-of-dependency rule that, if violated, breaks the entire "give it away, let
  people extend it without forking" premise.

## Decoupling notes
Every adapter interface defined elsewhere (payments, inventory, persistence, search index,
CMS components) IS a plugin point by construction — this subsystem doesn't invent a second,
parallel extension mechanism. Its actual job is mostly the event-subscription-based extension
points (reacting to things happening) plus documenting how someone finds and uses the adapter
interfaces that already exist across the other subsystem docs.

## Open questions
1. Plugin distribution — npm packages following a naming convention (like the DB/payment
   adapters), or a more structured plugin-manifest system?
2. Sandboxing/trust model — plugins run with full code-execution trust (simplest, matches most
   OSS plugin ecosystems) or is any isolation warranted given this handles payment/order data?
3. Versioned extension-point stability — adapter interfaces (payments, persistence, search,
   inventory) are the de facto plugin API; does this subsystem need its own semver/compat
   policy layered on top, or does that just inherit from core schema (00)'s own versioning?
