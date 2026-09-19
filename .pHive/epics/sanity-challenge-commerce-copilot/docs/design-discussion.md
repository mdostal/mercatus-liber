# Design Discussion: sanity-challenge-commerce-copilot

## 0. Prelude

No `.pHive/CONTEXT.md`, prior-decision KG, or `north_star` block conflicts found for this
topic beyond what's already in `.pHive/planning/epic-backlog.md` (epics 13, 18, 27, 29, 56,
57 — all cited below). Grill/multi-persona review ceremony was run in abbreviated form for
this epic (solo-operator session, no separate reviewer personas available) — risks below were
self-adversarially checked against the real research brief rather than a separate dispatched
review pass; flagged explicitly wherever that matters.

## 1. Goal

Build Mercatus Liber's Sanity CMS integration out to genuine depth, and submit the result to
the real Sanity Challenge (dev.to, deadline **Oct 4, 11:59 PM PDT**) on **both** of its two
paths, per explicit user direction (2026-09-19):

1. **Path Two ("the deep store")**: at least one flagship demo store with a real, deep
   Sanity + Mercatus Liber integration — verified-healthy production Sanity, a real
   schema-typed CMS section editor (replacing today's raw-JSON textareas), and a real admin
   dashboard that connects CMS sections to the theming system's per-page-type layout templates
   for genuine visual swapping — plus Sanity's own remote MCP server registered as a real,
   usable integration.
2. **Path One ("the lightweight wrapper" / AI copilot)**: a real AI chat interface in the
   admin dashboard where an admin describes desired page/content changes in natural language,
   the agent queries Sanity's Context MCP (Knowledge Base mode) plus Mercatus Liber's own
   CmsService/ThemingService, generates multiple real candidate options, and lets the admin
   apply one — closing the loop into (1)'s upgraded editor.
3. Two honest, real DEV.to submission write-ups (drafted as local files only — publishing is
   explicitly out of scope for `/execute`, a separate user-gated action).

Explicitly **out of scope**: the full product-configurator (attribute-matrix → SKU picker +
admin combination rules) the user also asked for in the same conversation. It's real, valuable,
well-grounded (the data model and even a dead-code `resolveSelection` already exist — see
research brief §6) — but it's core catalog/PDP work, not a Sanity integration, and bundling it
in risks the Oct 4 deadline. User confirmed this deferral explicitly. One-line forward
reference only; plan it as its own epic once this one ships.

## 2. Proposed approach

### 2a. Verify Sanity is actually healthy in production (story 1, blocks everything else)

`SANITY_PROJECT_ID`/`DATASET`/`TOKEN` are configured on Vercel Production today (confirmed via
`vercel env ls`), contradicting a stale planning note that claimed Sanity was reverted. Before
building anything on top of it, hit the live site with Sanity actually active (not just env
vars present) and confirm zero 500s across CMS-backed routes. If it's silently broken, fix
forward using the already-fixed `marketingMetaDocId()` collision logic as the reference point —
don't assume a second bug exists without evidence.

### 2b. CMS section editor: schema-typed forms, not raw JSON (Path Two)

Extend `ComponentRegistry`'s 5 entries from `{type, label, description}` to also carry a real
field schema (`fields: {key, label, kind: "text"|"richtext"|"image"|"productRef"|...}[]`) per
component type. Generate `CmsSectionFields.tsx`'s per-slot form from that schema instead of a
raw `<textarea>`. This is additive to `ComponentInstance.config`'s existing shape (still
`Record<string, unknown>` at rest) — only the *editing* surface changes, so no CMS persistence
adapter (Sanity, in-memory) needs migration. Follows the same "schema describes what a form
generates" spirit as `catalog`'s `identifyingAttributeKeys`, just applied to CMS sections.

### 2c. Content & Layout dashboard: connect CMS + theming for real (Path Two)

New admin page (e.g. `admin/content-layout`) that, per page type, shows: the current
`LayoutTemplate` (via `ThemingService.resolveTemplate`) with a real picker to call
`setDefaultTemplate` for that page type independently (today's `/themes` page only swaps whole
bundles) — plus the current page's CMS sections inline, using 2b's new schema-typed editor. This
is the first time these two systems are wired together; follows the existing admin-dashboard
conventions exactly (plain RSC, `requireAdminPermission("mutate")`-gated actions,
`adapter-info.ts`-style status rows for "which template is active per page type").

### 2d. Sanity's remote MCP: register, don't rebuild (Path Two)

This repo has zero MCP-client code and building one is out of proportion to what's needed.
Register `https://mcp.sanity.io` in a new `.mcp.json` alongside the existing stdio commerce MCP
server (`pnpm mcp`), and write a new agent-facing skill (`.claude/skills/sanity-content/SKILL.md`,
mirroring `create-store`'s exact convention: frontmatter, Overview, numbered Steps, Notes) that
documents the common workflows — querying the live schema, browsing/mutating content, and how it
composes with `manage_cms_page`. Zero new server-side code; genuinely real and immediately usable
in any Claude Code session pointed at this repo.

### 2e. AI copilot chat (Path One) — the largest net-new piece

Real architecture, all new:
- **LLM integration**: Anthropic Messages API via `@anthropic-ai/sdk` (new dependency), a
  server-side tool-calling loop. API key resolved via Portunus (`mercatus-liber-commerce`
  vault) if not already available through this environment's existing Claude access — verify,
  don't assume, before writing code that expects it.
- **Tools available to the agent**: (i) read-only queries against Sanity's Context MCP
  (Knowledge Base mode — schema + content semantic search, per research brief §5); (ii)
  Mercatus Liber's own real `CmsService`/`ThemingService` reads (current sections, current
  template per page type); (iii) a `propose_options` capability that generates 2-3 candidate
  section/template configurations per request (not calls to Sanity's write API directly — the
  agent proposes against Mercatus Liber's own `ComponentInstance`/`LayoutTemplate` shapes,
  which 2b/2c already make editable); (iv) an `apply_option` tool, gated behind the *same*
  `confirm:true`-then-`requireAdminPermission("mutate")` discipline every other admin mutation
  in this repo already follows — no new trust boundary invented.
- **UI**: a new admin chat surface, server-sent-events or polling (no existing chat/streaming
  infra to build on — confirmed by research brief §4), showing the conversation plus rendered
  option cards the admin can preview and apply, closing the loop into 2c's dashboard.
- **Risk, named plainly**: this is genuinely the highest-uncertainty piece of the whole epic —
  "generate multiple real content/layout options in real time" is a real prompt-engineering and
  UX problem, not just plumbing. Scope the first version to 2-3 fixed proposal "shapes" (e.g.
  swap hero copy + swap template) rather than fully open-ended generation, and treat genuine
  live-usability as the bar for done, not just "the API call succeeds."

### 2f. DEV.to submission drafts (both paths)

Draft two local markdown files under this epic's `docs/` — one per path, following the
Challenge's own submission templates — including the real Sanity project ID / public dataset
URL and any needed testing credentials. **Never publish these** as part of `/execute`; that's a
separate, explicit, user-gated action at submission time, not blanket authorization from this
plan.

## 3. Dependencies

Epic 13 (`ai-mcp-interface`) for the existing tool-definitions/handlers pattern the copilot's
tools should mirror. Epic 18 (`cms-content-adapters`) and 29 (`cms-adapter-discoverability`)
for the real Sanity adapter this epic builds on top of, unmodified at the persistence layer.
Epic 27 (`admin-auth-clerk`) for `requireAdminPermission`, reused unmodified for every new
mutation surface. Epic 56 (`real-provider-verification`) for the Sanity credential/incident
history this epic's first story re-verifies rather than assumes.

## 4. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Oct 4 deadline is genuinely tight for 2 net-new subsystems (schema-typed CMS editor + AI copilot) plus 2 submission writeups | High | Sequence 2a→2b→2c→2d before 2e (Path Two is lower-risk and ships the "deep store" submission on its own even if 2e slips); 2e gets a deliberately narrowed first-version scope (§2e) rather than open-ended |
| Sanity Context MCP / Knowledge Base is confirmed real but **beta, shipped this month** — behavior/limits may be under-documented or change | Medium | Build the copilot's Sanity-Context tool as an isolated, swappable piece (mirrors this repo's own adapter-swap discipline) so a beta hiccup doesn't block Path Two; verify Knowledge Base setup live early, not at the end |
| Production Sanity's actual health is unverified despite configured env vars (research brief §1) | Medium | Story 1 verifies this before any further work lands on top of it; if broken, fix forward using the known collision-fix pattern first |
| AI copilot's "apply" path is a genuinely new admin-mutation surface | Medium | Reuse `requireAdminPermission("mutate")` + `confirm:true` unmodified — no new authz model invented, same bar as every other admin action in this repo |
| Anthropic API key / Sanity Context MCP credentials may not exist yet in this environment | Low-Medium | Verify via Portunus before writing code that assumes them; if missing, this becomes a disclosed-gap story (same honest pattern as epics 42/43/44/46's credential-gap disclosures), not a blocker to shipping the rest |
| Publishing to DEV.to under the user's identity is hard-to-reverse and public | High (if done wrong) | Explicitly never done by `/execute` — drafts only, publish is a separate future user-gated action |

## 5. Open questions (resolved during this planning pass)

1. Which Challenge path(s)? → **Both**, per explicit user answer.
2. How deep should the Sanity MCP integration go? → **Both**: a real deep store (Path Two) AND
   a real AI copilot wrapper (Path One), per explicit user answer.
3. Is the product configurator in scope? → **No**, deferred to its own follow-on epic, per
   explicit user answer.

## 6. Scale assessment

**Large.** Multi-system (CMS package schema extension, theming/CMS bridge, new admin dashboard,
net-new AI/LLM subsystem with its own tool-calling loop and UI, MCP client registration, two
external submission artifacts), genuinely new architecture in more than one place (no prior LLM
integration or MCP-client code exists in this repo at all), and a real external deadline.
Proceeding to full H/V planning + structured outline.
