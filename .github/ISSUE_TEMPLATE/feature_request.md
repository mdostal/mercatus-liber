---
name: Feature request
about: Propose something new for Mercatus Liber — a subsystem, an adapter, or a core change
title: "[feature] "
labels: enhancement
assignees: ''
---

## Is this already on the roadmap?

Before writing this up, please check:

- `VISION.md`'s **"Wanted, not started — the community plugin frontier"** table — wishlist,
  backorder/pre-order, gift cards, subscriptions, loyalty, multi-currency, returns/RMA,
  marketplace/social-channel sync, and more are already scoped at a one-line level there as
  explicit community-contribution targets.
- `.pHive/planning/epic-backlog.md` — to see whether it's already planned or in progress as a
  numbered epic.

If your idea is already listed in `VISION.md`'s table, you can skip most of the sections below
and just say **which row** you're picking up plus any design thinking you already have — that
saves duplicate scoping work.

## What's the feature

A clear description of what you want to add or change.

## What kind of contribution is this?

- [ ] A new **adapter** for an existing subsystem (e.g. a new persistence backend, payment
      provider, CMS, fulfillment/shipping provider) — implementing an existing interface from
      `@mercatus-liber/core` or a subsystem package
- [ ] A new **subsystem/package** (e.g. one of the community-frontier items — wishlist, gift
      cards, subscriptions, etc.) — its own package under `packages/`
- [ ] A change to an **existing subsystem's interface or behavior** — note that this affects
      every adapter implementing that interface, so it needs more discussion up front
- [ ] Something else (describe it)

## Why it's not already core (or why it should be)

`VISION.md`'s design principles keep the core narrowly scoped — most new capabilities are meant
to be adapters or standalone subsystems, not core changes. If you think this genuinely needs to
be core, say why the adapter/plugin pattern (see `docs/subsystems/12-plugins-extensibility.md`)
doesn't fit.

## Proposed shape

However much you've already thought through: what interface would this implement or expose,
what other subsystems (if any) would it need to talk to (via shared core types or the event bus
— never by importing another subsystem's internals, see `docs/ARCHITECTURE.md`'s "Prime
directive"), and whether it needs a real third-party account/credential to fully verify.

## Are you planning to build this yourself?

- [ ] Yes, I'd like to submit a PR for this
- [ ] No, just proposing it for someone else (or a future me) to pick up
