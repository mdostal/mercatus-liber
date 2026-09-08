# Design Discussion — Epic 23: `advertising`

## 0. Prelude

**Source:** backlog epic 23 (`.pHive/planning/epic-backlog.md`), identified by epic 17's
commerce-gap audit, backlogged 2026-09-08, planned immediately after epics 20-22, all merged
to master. Per the backlog: "CMS already ships a static `ad-slot` component (subsystem 05) but
nothing manages ad campaigns/creative/targeting/rotation to actually fill it — currently just
a hand-authored config block."

## 1. Goal

A campaign/creative/targeting/rotation management layer that actually fills CMS's existing
`ad-slot` component with dynamic content, without changing CMS's public contract.

## 2. Research findings (grounding)

- **The ad-slot component today does genuinely nothing** —
  `apps/reference-storefront/components/cms-sections.tsx`'s `"ad-slot"` case is literally
  `return null; // no ad content in this reference demo`. `packages/cms/src/types.ts`'s
  `ComponentInstance { componentType: string; config: Record<string, unknown> }` is fully
  generic — CMS itself has no ad-specific schema and never will, per its own doc's stance that
  a component's config shape is opaque to the CMS package (rendering is a theming/app-layer
  concern, not CMS's job). This confirms the backlog's framing precisely: there's no hardcoded
  ad content to migrate, just an unimplemented render case.
- **`docs/subsystems/05-cms-pages.md` is silent on ad-slot's evolution** — no open question
  claims or punts on campaign management; it's genuine unaddressed white space, not a decision
  already made elsewhere.
- **The plug-in point requires zero changes to `packages/cms`.** `ComponentInstance`,
  `PageRepository`, `CmsService`, and the component registry (`component-registry.ts:6`) all
  stay exactly as they are — a new `AdSlot` component simply replaces the `return null;` case
  in `cms-sections.tsx`, calling a new `advertising` service via `getServices()`, the same
  composition idiom `CategorySpot`/`ProductGrid` already use for their own data.
- **No "targeting" concept exists anywhere in the repo today** (zero hits for "targeting").
  `packages/service-areas` (subsystem 15) is a clean, reusable geographic ("where") dimension
  distinct from marketing-catalog's categories ("what kind") — a campaign can reference a
  `serviceAreaId` by bare id, resolved at the app-composition layer, exactly the pattern
  bundles/recommendations already established for referencing catalog/marketing-catalog data.
  CMS page slug is an equally simple, even more direct targeting dimension (which ad-slot
  placement is this — home page vs. a specific service-area page).
- **No rotation/scheduling infrastructure exists anywhere** (`packages/core` has no
  weighting/round-robin/cron primitive). Unlike epic 22's analytics-read-side gap, this isn't
  blocked on missing infra elsewhere — a stateless weighted-random selection over an
  admin-curated, currently-eligible creative set, computed fresh per request, needs no new
  `core` primitive and no persistent rotation state.
- **Core-schema's file-header rule still applies**: a campaign/creative record references
  `serviceAreaId`/page slug by bare id/string, never duplicating `ServiceArea`/`Page` fields.

## 3. The design question, resolved: admin-curated campaigns/creatives, stateless weighted rotation, optional wildcard-or-exact targeting — analytics-driven optimization explicitly out of scope

**Decision: new subsystem, `advertising` (package `@mercatus-liber/advertising`), subsystem
19.** Depends on `@mercatus-liber/core` only, mirroring promotions/bundles/recommendations
exactly — never imports `cms`, `service-areas`, `catalog`, `marketing-catalog`, or `analytics`.

**Domain model:**

```ts
interface Campaign {
  id: string;
  name: string;
  status: "active" | "inactive";
  startsAt: string | null;   // ISO 8601; null = active immediately
  endsAt: string | null;     // ISO 8601; null = no expiry
  targeting: {
    serviceAreaId: string | null;  // null = untargeted on this dimension (matches any)
    pageSlug: string | null;       // null = untargeted on this dimension (matches any)
  };
  creatives: Creative[];
}
interface Creative {
  id: string;
  headline: string;
  body: string;
  imageUrl: string | null;
  linkHref: string;
  weight: number;  // relative selection weight for rotation, default 1
}
```

An **untargeted campaign** (both targeting fields `null`) is eligible for every ad-slot render.
A campaign targeting one dimension only constrains that dimension; both set requires both to
match. This is the simplest possible wildcard-or-exact model — no audience segmentation, no
percentage rollouts, matching bundles' "free text label, no hardcoded vocabulary beyond the
mechanism" posture of keeping v1 mechanisms minimal and legible.

**Rotation:** `AdvertisingService.getActiveCreativeForSlot(input: { pageSlug?, serviceAreaId?,
now? })` resolves every currently-eligible campaign (status active, within
`startsAt`/`endsAt`, targeting matches or is wildcard), flattens their creatives, and does a
**stateless weighted-random pick** among them — computed fresh on every call, no persisted
rotation state, no click/impression tracking. The service accepts an injectable random source
(defaults to `Math.random`) purely so this is unit-testable deterministically; this is an
implementation testability detail, not a design requirement callers need to know about.

**Why admin-curated, not data-driven/optimized:** identical reasoning to epic 22's
recommendations decision — `packages/analytics` (subsystem 13) is write-only with no queryable
read side (already established in that epic's own research), so there is no impression/
click-through data anywhere in this repo to optimize rotation against. A/B testing or
statistically-driven creative selection would need a whole new analytics-read-model
undertaking, explicitly out of scope here (§4).

**CMS/app integration:** `apps/reference-storefront/components/cms-sections.tsx`'s `"ad-slot"`
case becomes a real `<AdSlot>` component. It resolves the current page's slug (and, when the
current page is a service-area page, that area's id) and calls
`advertising.getActiveCreativeForSlot({ pageSlug, serviceAreaId })`. When nothing is eligible,
it renders nothing — an ad slot with no matching campaign is not an error state, the same
posture bundles/recommendations take for their own "nothing to show" cases. `packages/cms`
itself is never touched.

## 4. Explicitly out of scope (documented non-goals)

- **Real ad-serving** (external ad networks, bidding, budget pacing) — this is an in-house
  promotional-placement manager for a store's own campaigns, not an ad-exchange integration.
- **Click-through/impression tracking or performance-based optimization** — blocked on
  analytics having no read side (same constraint epic 22 documented); a future epic could
  revisit this once/if a repo-owned analytics read model exists.
- **A/B testing or statistically-driven creative selection** — no experimentation
  infrastructure exists anywhere in this repo; weighted-random is the entire "rotation"
  mechanism for v1.
- **Cron/scheduled campaign activation** beyond simple `startsAt`/`endsAt` date-range fields
  checked inline at render time — no job-scheduler infrastructure exists, and a checked
  date-range field needs none.

## 5. Scale assessment

**Medium.** Multi-file (new package + CMS-render-layer composition + admin UI), multiple
layers, one new subsystem, zero changes to `packages/cms`, `service-areas`, or any other
existing subsystem's public contract. Proceeding directly to story decomposition.

## 6. Version bump

`minor` — new package, new optional capability, zero breaking change to any existing
subsystem.
