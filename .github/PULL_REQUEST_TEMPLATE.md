## What this changes

A clear description of what the PR does and why.

Related issue(s): closes #

If this implements something from `VISION.md`'s community-frontier table, name the row. If it's
a numbered epic from `.pHive/planning/epic-backlog.md`, name it.

## Kind of change

- [ ] New adapter (implements an existing interface — persistence, payments, CMS, fulfillment,
      shipping, analytics, etc.)
- [ ] New subsystem/package
- [ ] Bug fix
- [ ] Core/interface change (affects every adapter implementing it — please confirm you've
      checked the existing adapters still satisfy the interface)
- [ ] Docs only
- [ ] Other

## Checklist

- [ ] `pnpm turbo run typecheck test build --force` passes clean for everything this PR touches
      (ideally the whole workspace — Turbo's cache makes a full re-run cheap after the first
      one).
- [ ] New/changed behavior has real tests (Vitest) — not placeholder assertions, and not mocks
      of the subsystem under test where a real in-memory/seeded-data test is feasible instead.
- [ ] No subsystem package imports another subsystem's internals (see `docs/ARCHITECTURE.md`'s
      "Prime directive: no tight coupling"). Cross-subsystem communication goes through
      `@mercatus-liber/core` shared types, an adapter interface, or the event bus.
- [ ] If this is an adapter: its public surface is exactly the interface it implements — no
      provider-specific types leak out.
- [ ] If this changes an existing interface: every existing adapter implementing it still
      compiles and passes its own tests.
- [ ] The diff is scoped to what this PR is actually about (no unrelated file changes swept in).
- [ ] If a real third-party credential/account is required to verify this live and you don't
      have one, that's stated plainly here rather than implied to be fully verified.

## How this was tested

What you actually ran, not just "tests pass." e.g. which package's test suite, whether you ran
it against a real database/provider or the zero-infra default, and whether you exercised it
against a real local dev server.
