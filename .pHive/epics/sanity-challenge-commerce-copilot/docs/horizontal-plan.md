# Horizontal Plan: sanity-challenge-commerce-copilot

## Layers touched

1. **Infra/verification** — no code, live checks only (production Sanity health).
2. **`packages/cms`** — `ComponentRegistry` schema extension (additive: `fields[]` per type).
3. **`packages/theming`** — no core changes; consumed as-is via `resolveTemplate`/`setDefaultTemplate`.
4. **`apps/reference-storefront/app/.../admin/cms/**`** — schema-typed section form (replaces raw-JSON textarea rendering, same data shape underneath).
5. **`apps/reference-storefront/app/.../admin/content-layout/`** (new) — dashboard tying layers 2-4 + theming together.
6. **Repo root `.mcp.json`** (new) + **`.claude/skills/sanity-content/SKILL.md`** (new) — Sanity remote MCP registration + agent-facing skill.
7. **New `packages/ai-copilot` (or `apps/reference-storefront/lib/copilot/`)** — Anthropic SDK integration, tool-calling loop, Sanity-Context-MCP client, propose/apply tools.
8. **`apps/reference-storefront/app/.../admin/copilot/`** (new) — chat UI, SSE/polling, option-card rendering.
9. **`apps/reference-storefront/lib/actions.ts`** — new `applyContentOptionAction` etc., following the existing `requireDemoSlug`+`requireAdminPermission("mutate")` opener.
10. **Docs** — two DEV.to submission drafts (local `.md` only, this epic's `docs/` dir).

## Cross-layer dependencies

- Layer 5 (dashboard) depends on layer 2 (schema) and layer 4 (form) both landing first.
- Layer 8 (copilot UI) depends on layer 7 (copilot backend) and layer 5 (dashboard, since apply
  closes the loop into it).
- Layer 6 (MCP registration) is independent of everything else — can land any time, in parallel
  with layers 2-5.
- Layer 10 (submission drafts) depends on everything else being real and demoable — last.

## Sequencing rationale

Path Two (layers 1-6) is self-contained and lower-risk — it can ship and be demoable on its own
even if Path One (layers 7-9) needs more iteration given its genuinely novel scope (see design
discussion §2e risk). Sequence Path Two to completion first, in parallel start the MCP
registration (layer 6, independent), then build Path One on top of a working Path Two dashboard
(since "apply" needs somewhere real to land).
