---
name: Bug report
about: Report something in Mercatus Liber that's broken
title: "[bug] "
labels: bug
assignees: ''
---

## What's broken

A clear description of what's wrong.

## Where it happened

This repo's whole point is adapter-swappability (see `VISION.md` — "adapter-first, always"), so
the exact combination matters a lot for reproducing a bug. Fill in whatever applies:

- **Demo store (if reproduced on `commerce.mdostal.com`):** print-shop / northline / broadleaf /
  n/a (self-hosted)
- **Persistence adapter:** SQLite / Postgres / MongoDB / Convex / Shopify / other (name it)
- **Other adapters involved, if relevant:** CMS (Sanity / in-memory default), payments (Stripe),
  admin auth (Clerk / dev-password default), fulfillment (manual / Printful / Printify),
  shipping (manual / Shippo), analytics (PostHog / noop default)
- **Package/app affected:** e.g. `packages/checkout-orders`, `apps/reference-storefront`
- **Environment:** local dev / self-hosted deployment / `commerce.mdostal.com`
- **Commit or version:** `git rev-parse HEAD` output, or the `package.json` version if you're on
  a self-hosted store built with `create-mercatus-liber-store`

## Steps to reproduce

1.
2.
3.

## Expected behavior

What you expected to happen instead.

## Actual behavior

What actually happened. Include exact error messages/stack traces if there are any — paste the
real text, don't paraphrase it.

## Additional context

Screenshots, logs, links to a relevant `docs/subsystems/*.md` page, or anything else that helps
narrow it down. If you already have a guess at the root cause (e.g. "looks like the same
cross-demo content-bleed class documented in epic-backlog row 60-62"), say so.
