# Subsystem 26 — Community Goals

## Purpose
Vote-threshold-gated feature unlocks: a storefront publishes a `Goal` (e.g. "1000 votes
unlocks the live print stream; 2000 unlocks a second printer"), visitors/customers each cast
one deduped vote, and the goal's unlock status derives purely from `voteCount` vs its
thresholds. Born from a real storefront request (dostal-3d-printing's "watch it build" live
MQTT printer-status feature, gated behind community demand before shipping a camera/live
stream nobody asked for yet) but genuinely general-purpose — any "N people have to want this
before we build it" feature fits the same shape.

## Depends on
`@mercatus-liber/core` only (the `EventBus` type, optional). No dependency on catalog, cart,
or customer-account — voter identity is a caller-supplied opaque `voterKey` string, not a
structural dependency on account's `Customer` shape. A storefront that wants "one vote per
signed-in customer" passes a `customerId`; one that wants "one vote per guest" passes a
session/cookie token. This subsystem has no opinion which.

## Responsibilities
- `Goal` entity: id, slug (storefront-facing, unique), title, description, `targetCount`,
  optional `bonusCount` (a second, higher stretch threshold — must exceed `targetCount`),
  `voteCount` (denormalized, incremented once per newly-recorded vote, never re-derived by
  counting), optional `demoSlug` (same scoping precedent as `Bundle.demoSlug`/
  `Page.demoSlug`/`Category.demoSlug`/`ServiceArea.demoSlug`).
- `GoalRepository` + `GoalVoteRepository` (adapter pattern) + in-memory reference
  implementations. `GoalVoteRepository.recordIfNew` is the single atomicity-critical
  operation in this subsystem — a durable adapter MUST back it with a real unique constraint
  on `(goalId, voterKey)`, not a separate has-then-set.
- `GoalsService.castVote(goalId, voterKey)` — idempotent per voter; returns which threshold
  (if any) that exact vote crossed, so a caller reacts exactly once per threshold rather than
  on every vote after it.
- `computeGoalStatus(goal)` — pure, I/O-free derivation of `status` ("locked" / "unlocked" /
  "bonus-unlocked") and `progressToTarget`/`progressToBonus` (0..1, uncapped past 1 so a
  storefront's liquid-fill/overflow visual can read "how far past the line it's spilled"
  directly instead of a clamped value hiding that). Never cached onto the `Goal` record
  itself, same "derive, don't cache" discipline as `Bundle`'s `TierPricing`.
- `community-goals.vote.cast` and `community-goals.goal.threshold_crossed` events on the
  shared `EventBus`, for a notification/admin/analytics subsystem to react without this
  package importing any of them.

## Explicitly NOT this subsystem's job
- **Any rendering.** No progress-bar, liquid-fill-container, gradient, or animation code
  lives here — `computeGoalStatus`'s plain numbers are the entire contract a storefront's own
  design system builds on, the same separation `packages/pdp`/`packages/theming` already draw
  from `packages/catalog`. (Per the storefront owner's own direction: the visual/animation
  work is explicitly a different team's scope, loading their own design/animation skills —
  this subsystem only has to hand them real, correct numbers.)
- **Voter identity/auth.** `voterKey` is opaque; this subsystem never looks up, creates, or
  validates a customer. A storefront wiring this to `@mercatus-liber/account` customer ids
  (or to an anonymous cookie) is app-composition, not a structural dependency here.
- **The actual unlocked feature.** This subsystem only tracks whether a goal crossed its
  threshold — gating a real MQTT printer-status feed, a camera stream, or "add a second
  printer" is entirely downstream app logic reacting to `threshold_crossed`.
- **A durable (sqlite/postgres) adapter in v1.** Ships in-memory only at v1, the same posture
  `packages/bundles` took initially (see its own subsystem doc) — a durable adapter is a
  clearly-scoped, separable follow-up once a real deployment needs votes to survive a
  restart.

## Decoupling notes
`packages/community-goals`'s only dependency is `@mercatus-liber/core`. Verify via
`grep -rn "@mercatus-liber/community-goals" packages/catalog packages/cart
packages/checkout-orders/src packages/account/src packages/promotions/src` before merge —
every one of those must return zero hits; community-goals is consumed only by
`apps/reference-storefront` (the composition root) and, downstream, by whichever storefront
wires a UI on top of it.

## Open questions
1. Durable persistence (sqlite/postgres `GoalVoteRepository`, with a real unique constraint
   on `(goalId, voterKey)`) — v1 ships in-memory only; see "Explicitly NOT this subsystem's
   job" above.
2. Rate-limiting/abuse resistance for anonymous `voterKey`s (e.g. a bot casting votes from
   many cookie values) is intentionally out of scope here — that's a storefront-layer
   concern (e.g. a CAPTCHA or IP-based throttle in front of the vote endpoint), not something
   this subsystem's data model should encode.
3. Multi-state unlock rewards beyond two tiers (target/bonus) — not requested yet; the type
   shape (`targetCount`/`bonusCount`) would need to become an ordered list of thresholds if a
   real use case needs a third tier.
