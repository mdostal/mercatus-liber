# Design Discussion — Epic 30: `create-store-skill`

## 0. Prelude

**Source:** a direct finding from a fresh gap audit (2026-09-08): `packages/create-store` is a
real, working human CLI (`npx create-mercatus-liber-store <name> --adapter <x> --theme <y>
[--plugins a,b,c] [--dir <path>]`), but has no README, and there's no `SKILL.md` anywhere in
this repo and no agent-facing MCP tool for provisioning a *new* store. The existing
`ai-interface` package's MCP tools all operate an *already-running* store (matches subsystem
14's own explicit scope). Today an agent can shop and manage an existing store; it cannot
stand one up.

## 1. Goal

An agent working in (or given context on) this repo can provision a new store end-to-end —
gather the needed choices, run the scaffolder, verify the result, and know what to tell the
human about post-scaffold configuration — the same way a human running the CLI by hand would.

## 2. Design decision: a Claude Code project skill, not a new MCP tool

**Why a skill (`.claude/skills/create-store/SKILL.md`), not an MCP tool added to
`ai-interface`:** `ai-interface`'s own scope (subsystem 14) is explicit — it wraps an
*already-built and running* store's catalog/cart/checkout/CMS/inventory for an agent shopping
or administering that live instance. Store *provisioning* happens before any store exists to
run an MCP server against — it's a build-time/setup-time action on the monorepo checkout
itself (running a CLI, writing files to a new directory, installing dependencies), not a
runtime store-operation. That is exactly the shape a Claude Code skill covers (a documented,
repeatable procedure an agent follows using ordinary tools — Bash, Read, Write) — not a new
protocol surface `ai-interface`'s MCP server would have to expose at store-runtime.

**What gets built:**
- `packages/create-store/README.md` — human-facing CLI docs that plainly didn't exist before:
  usage, every flag, the three adapter choices, the seven theme keys, what a scaffold produces
  and what it deliberately doesn't (the generated `services.ts` is a partial starter —
  catalog/cart/theming only, per its own doc comment — not a full copy of the reference app's
  wiring).
- `.claude/skills/create-store/SKILL.md` — the agent-facing procedure: gather the required
  choices (store name, adapter, theme, optional plugins) from whoever's asking, run the CLI,
  `pnpm install` and typecheck the result to confirm it actually works, then tell the human
  exactly which environment variables their chosen adapter needs (matching the main README's
  own Configuration section) and that CMS/payments/inventory/analytics/ai-interface wiring is
  a manual follow-up, pointing at `apps/reference-storefront/lib/services.ts` as the complete
  reference, per the generated file's own comment.

## 3. Explicitly out of scope

- Teaching the generated `services.ts` to include CMS/payments/inventory/analytics/ai-interface
  wiring automatically — that's `create-store`'s own scaffolder gaining real new capability,
  a separate, larger piece of future work, not a skill/docs gap. The skill's job is to make the
  *existing* scaffolder actually usable end-to-end by an agent, not to expand what it generates.
- A new MCP tool for store provisioning — per §2's reasoning, this isn't the right protocol
  surface for a build-time action on the monorepo itself.

## 4. Version bump

`none` — pure documentation and a new agent-facing skill file; zero code change to any package.
