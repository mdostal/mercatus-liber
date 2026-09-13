# Subsystem 24 — Reviews

## Purpose
Product reviews and ratings with a real moderation queue — the "bare basics" every commerce
site needs (see `.pHive/planning/epic-backlog.md` epic 49's own reversal of the earlier call that
this was community-plugin territory, not core). A shopper submits a review, it starts `pending`,
and it only ever reaches a PDP once an admin explicitly moderates it to `published`.

## Depends on
`@mercatus-liber/core` only (for the `EventBus`). Never imports `catalog`, `marketing-catalog`,
`cms`, or any other subsystem — a review's `productId` is a bare string, resolved by the
app-composition layer, the same thin-coupling posture `recommendations`/`advertising` use.

## Responsibilities
- `Review` entity: id, productId, rating (1-5), authorName, title, body, `verifiedPurchase`
  (defaults false), `status` (`pending` / `published` / `rejected`), createdAt.
- `ReviewsService.submitReview` — always lands `pending`, regardless of caller; there is no
  "auto-publish" path anywhere in this package. Publishes `reviews.review.submitted`.
- `ReviewsService.listPublishedReviewsForProduct` — the real public PDP read path; filters to
  `published` only, so a pending or rejected review can never leak onto a live product page no
  matter who calls it.
- `ReviewsService.listAllForModeration` — the admin queue's read path, every status, optionally
  filtered by one status.
- `ReviewsService.moderateReview(id, "published" | "rejected")` — the only way a review's status
  changes after submission. Publishes `reviews.review.published` only on the published
  transition (never on rejection).
- `ReviewsService.getRatingSummary(productId)` — average + full 1-5 distribution, computed fresh
  from `listPublishedReviewsForProduct` on every call, never cached or stamped (same "always
  live" posture as `PromotionsService.evaluate`).
- `ReviewRepository` (adapter pattern) + in-memory reference implementation.

## App-layer wiring (apps/reference-storefront)
- PDP (`app/demo/[demoSlug]/products/[slug]/page.tsx`): renders `getRatingSummary` +
  `listPublishedReviewsForProduct` — a zero-count summary and an empty reviews array render
  byte-for-byte what a PDP looked like before this subsystem existed (the review section and
  "write a review" form are additive, not gating).
- Shopper submission: `submitReviewAction` (`lib/actions.ts`) — a plain form action, no
  authentication required (matches every other real e-commerce review form).
- Admin moderation: `/admin/reviews` — every review regardless of status, with Publish/Reject
  actions per row, gated by the same `requireAdminPermission("mutate")` guard every other admin
  mutation carries. Product names/links are resolved from `CatalogService.getProduct` at render
  time (a review only stores the bare `productId`).
- Seed content: all 3 demo stores (`lib/seed.ts`/`seed-northline.ts`/`seed-broadleaf.ts`) seed a
  real mix of published and (deliberately) still-pending reviews via the actual
  `submitReview` → `moderateReview` path, never fabricated pre-published records, so the
  moderation queue always has real pending work to demonstrate.

## Explicitly NOT this subsystem's job
- Verified-purchase enforcement — `verifiedPurchase` is a plain caller-supplied boolean today;
  no order-history cross-check exists. A real deployment wiring this to actual order data is a
  documented future integration point, not a silent gap.
- Review helpfulness voting, photo/video attachments, or seller responses — none of the
  "advanced" review-platform features exist; this is the bare-basics submit → moderate →
  display loop only.
- Spam/abuse filtering beyond manual moderation — every review requires a human Publish/Reject
  decision; there is no automated content-moderation heuristic.

## Open questions
1. No dedicated test file exists for this subsystem in `apps/reference-storefront/test/`
   (`packages/reviews` itself is unit-tested, but the app-layer wiring — PDP display, the
   submission action, the moderation queue's product-name resolution — is currently only
   live-verified against a running dev server, not covered by an automated regression test).
   A real, disclosed gap, not forgotten — worth a dedicated `reviews.test.ts` as a follow-up.
