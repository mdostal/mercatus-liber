# Subsystem 26 — Community Goals

## Purpose
Vote-threshold-gated feature unlocks: a storefront publishes a `Goal` (e.g. "1000 votes
unlocks the live print stream; 2000 unlocks a second printer"), visitors/customers each cast
one deduped vote, and the goal's unlock status derives purely from `voteCount` vs its
thresholds. Born from a real storefront request (dostal-3d-printing's "watch it build" live
MQTT printer-status feature, gated behind community demand before shipping a camera/live
stream nobody asked for yet) but genuinely general-purpose — any "N people have to want this
before we build it" feature fits the same shape.

## Reference storefront wiring
`apps/reference-storefront` exposes a `goals` service on the Services bag (Postgres-when-
DATABASE_URL / in-memory-otherwise, same priority-chain pattern as every other subsystem in
`lib/services.ts`), a minimal admin CRUD page (`/demo/[demoSlug]/admin/community-goals` --
create a goal, see its real vote count/status, enable/disable it), and the **public,
unauthenticated** toolset a storefront's own client-side UI calls:
`GET`/`POST /api/demo/[demoSlug]/community-goals/[slug]` -- GET reads `computeGoalStatus`,
POST casts one vote (deduped by an anonymous, demo-namespaced cookie minted by
`lib/voter-cookie.ts`, same pattern as `lib/cart-cookie.ts`'s own anonymous cart identity) and
returns 409 against a disabled goal. Verified end-to-end against a real `next start`
production build (not just `next dev`), including a genuine race-free dedup, threshold
crossing, and the 409 disabled-vote path.

**A real bug found and fixed doing that verification**, not specific to community-goals:
`lib/services.ts`'s `servicesByDemo` memoization cache was a plain module-scoped `const`.
Next.js's App Router bundles Route Handlers into their own module graph, separate from the
Server Action/page-render bundle -- confirmed live in production (not a dev/Turbopack
artifact): a goal created via the admin page's Server Action was invisible to the Route
Handler reading the same demo's services right after, and a thrown `GoalDisabledError` failed
an `instanceof` check in the Route Handler's catch block for the identical cross-bundle
reason. Fixed by pinning `servicesByDemo` onto `globalThis` (the standard Next.js singleton
pattern) and switching the error check to `err.name === "GoalDisabledError"`. This had never
surfaced before because community-goals is the first subsystem pairing a Route Handler with
mutable, Server-Action-written in-memory state -- restores "the in-memory default genuinely
works, zero infra" (docs/ARCHITECTURE.md principle 4) for every subsystem's in-memory
repository, not just this one. The fix also broke 5 test files' `vi.resetModules()`-based
isolation (they relied on module-registry reset alone to clear `servicesByDemo`, which no
longer holds once it's globalThis-backed) -- fixed by a new, test-only
`__resetServicesCacheForTests()` export, called alongside `vi.resetModules()` in all 5.

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
  counting), `enabled` (admin on/off switch, defaults true, deliberately named apart from
  `GoalStatus`'s own derived `status` field to avoid the two colliding), optional `demoSlug`
  (same scoping precedent as `Bundle.demoSlug`/`Page.demoSlug`/`Category.demoSlug`/
  `ServiceArea.demoSlug`).
- `GoalsService.enableGoal`/`disableGoal` — admin toggle, same one-liner-over-a-partial-patch
  shape as `Bundle.deactivateBundle`. `castVote` against a disabled goal throws
  `GoalDisabledError` rather than silently no-op'ing or silently counting it.
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
1. ~~Durable persistence~~ — **resolved**: `@mercatus-liber/adapter-postgres` now ships
   `createPostgresGoalRepository`/`createPostgresGoalVoteRepository`
   (`packages/adapter-postgres/src/community-goals.ts`), with `recordIfNew` backed by a real
   `PRIMARY KEY (goal_id, voter_key)` constraint via `INSERT ... ON CONFLICT DO NOTHING
   RETURNING goal_id` — genuinely atomic under concurrency, verified with a racing-calls
   probe, not just sequential tests. Not yet wired into `apps/reference-storefront/lib/
   services.ts` (no live demo persists goals yet) — that's the next natural story.
2. Rate-limiting/abuse resistance for anonymous `voterKey`s (e.g. a bot casting votes from
   many cookie values) is intentionally out of scope here — that's a storefront-layer
   concern (e.g. a CAPTCHA or IP-based throttle in front of the vote endpoint), not something
   this subsystem's data model should encode.
3. Multi-state unlock rewards beyond two tiers (target/bonus) — not requested yet; the type
   shape (`targetCount`/`bonusCount`) would need to become an ordered list of thresholds if a
   real use case needs a third tier.
4. ~~`castVote` had a vote-count race condition~~ — **resolved** (castvote-race-condition
   fix, reported from a real downstream integration building against this API): `castVote`
   used to read `goal.voteCount` once, then compute `before`/`after` locally before calling
   `save()` — concurrent votes on the same goal could read the same stale snapshot, silently
   lose an increment (last `save()` wins), and independently (sometimes wrongly) believe they
   crossed a threshold. Fixed with a new `GoalRepository.incrementVoteCount(id)`, required to
   be atomic at the repository layer (a single `UPDATE ... SET vote_count = vote_count + 1
   RETURNING *` for Postgres; a synchronous Map read-modify-write for in-memory, atomic by
   construction since there's no `await` inside it). `castVote` now derives `before`/`after`
   from its own atomic increment's return value (`before = after - 1`) instead of the earlier
   stale read, which is correct regardless of how many other votes are racing alongside it.
   `GoalVoteRepository.recordIfNew`'s own dedup was never affected — per-voter dedup was
   already correctly atomic; only the aggregate `voteCount` counter had the race.
