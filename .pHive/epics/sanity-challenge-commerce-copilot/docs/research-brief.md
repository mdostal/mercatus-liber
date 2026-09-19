# Research Brief: sanity-challenge-commerce-copilot

Compiled from a fresh code audit (2026-09-19) across 4 targeted research passes (Sanity
integration state, theming/layout system, MCP/AI-interface, admin dashboard conventions),
plus two live web lookups (Sanity Challenge rules, Sanity's Context MCP/Knowledge Base docs).
All findings below are grounded in direct file reads with file:line citations — nothing here
is recalled from a prior planning note without re-verification (a prior note claiming Sanity
was "reverted out of production" was found to be stale during this pass).

## 1. Sanity CMS integration — real, live, healthy-on-paper

- `packages/adapter-sanity/src/index.ts` (74 lines): `createSanityAdapter(config)` implements
  `CmsPersistenceAdapter` against Sanity's real Content API — Query API (GROQ, via
  `sanity-client.ts`'s hand-rolled `fetch`, not the `@sanity/client` SDK) and Mutations API
  (`createOrReplace`).
- `apps/reference-storefront/lib/services.ts:709-715`: `SANITY_PROJECT_ID` truthy → real
  Sanity adapter; else in-memory. Live-wired, global across all 3 demos (no per-demo override
  yet, unlike the persistence-backend system epic 57 built).
- The epic-56 "`_id` collision" crash (marketing-page-meta docs colliding with page docs in
  Sanity's global-per-project `_id` namespace) is fixed: `marketingMetaDocId()` in
  `packages/adapter-sanity/src/mapping.ts:62`, covered by a regression test.
- **Correction to `.pHive/planning/epic-backlog.md` row 56**: that note claims Sanity was
  "reverted out of production." `vercel env ls production` today shows `SANITY_PROJECT_ID`/
  `SANITY_DATASET`/`SANITY_TOKEN` genuinely configured on Vercel Production (7-8 days old).
  Whether it's serving without erroring needs a real live check — first story of this epic,
  not assumed either way.

## 2. CMS section editor — real but primitive

- `packages/cms/src/types.ts`: `Page.sections: ComponentInstance[]`,
  `ComponentInstance = {componentType, config: Record<string,unknown>}` — deliberately
  untyped `config`.
- `ComponentRegistry` ships 5 hardcoded component types (hero-banner, ad-slot, category-spot,
  product-grid, service-area-info), each just `{type, label, description}` — no field schema.
- `apps/reference-storefront/app/demo/[demoSlug]/admin/cms/**`'s `CmsSectionFields.tsx`: 6
  fixed slots, each a component-type `<select>` + a raw-JSON `<textarea>` for `config`. No
  visual builder, no live preview, no schema-typed fields.

## 3. Theming/layout system — real but disconnected from CMS

- `packages/theming/src/types.ts`: `LayoutTemplate = {key, pageType, label, description}` —
  metadata only.
- `ThemingService.resolveTemplate(pageType, override?)`: explicit override > per-demo default
  (`setDefaultTemplate`) > first-registered.
- Template→React-component mapping is hardcoded app-side (e.g. `app/demo/[demoSlug]/layout.tsx`'s
  `NAV_TEMPLATES` map) — adding a template means hand-editing this map.
- Resolution is server-side per-request from a demo-namespaced cookie
  (`lib/theme-cookie.ts`'s `readActiveThemeBundle`). Admin-configurable today only via a single
  whole-bundle picker at a separate top-level `/themes` page (`applyThemeAction` writes the
  cookie) — no per-page-type independent override UI exists.
- **CMS sections and theming templates are two entirely separate systems today** — this epic's
  "swap around areas and layouts" ask requires connecting them for real, not inventing a third
  system.

## 4. MCP/AI-interface — server-only, zero client capability

- `packages/ai-interface/` (epic 13, done): plain JSON-Schema `ToolDefinition[]`
  (`tool-definitions.ts`, no zod), structural/duck-typed `CommerceToolDeps` (`types.ts`), thin
  `handlers.ts`, `confirm:true`-gated preview-then-confirm flow (`confirmation.ts`).
  `src/mcp-server.ts` wraps this with the MCP SDK's low-level `Server` (deliberately zod-free).
- `apps/reference-storefront/mcp-server.ts:32-52`: real standalone stdio entry point
  (`pnpm mcp`), hardcoded to the print-shop demo (1 stdio process = 1 client, no per-request
  demo routing).
- **Confirmed via repo-wide grep: zero MCP-client code anywhere.** No `.mcp.json`. No Vercel AI
  SDK / `ai`/`@ai-sdk/*` deps. No chat UI. The entire "AI-driven" surface today is the stdio
  server itself, consumed externally (e.g. by Claude Code).

## 5. Sanity's real MCP surfaces (confirmed via sanity.io/docs + web search, 2026-09-19)

- **Sanity MCP Server** (`https://mcp.sanity.io`): GROQ query, document CRUD, schema
  deploy/Studio deploy, Content Releases, asset upload, semantic search over embeddings, CORS/
  project admin. OAuth or API-token auth. `npx sanity@latest mcp configure` auto-configures
  Claude Code.
- **Sanity Context MCP** (`sanity.io/docs/ai/sanity-context-mcp`) — a DIFFERENT, real,
  currently-beta (shipped this month) hosted MCP server: structured READ-ONLY access via GROQ
  mode (schema + documents) or Knowledge Base mode (a pre-built index over chosen sources:
  datasets/websites/files). Keyword (BM25), semantic (`text::semanticSimilarity()`), and hybrid
  search. **This is what the Sanity Challenge's Path One requires.**

## 6. Product/SKU attribute-matrix — real data model, dead-code resolution logic (OUT OF SCOPE this epic)

- `packages/core`'s `IdentifyingAttribute{key,value}` + `generateSkus`'s real cartesian product
  (`packages/catalog/src/variant-utils.ts`) + `packages/pdp/src/service.ts`'s
  `resolveSelection`/`resolveVariant` all exist and are unit-tested, but `resolveSelection` is
  never called from any app route — PDP renders a flat SKU list today. Confirmed real,
  well-scoped, genuinely de-risked follow-on work — deliberately deferred to a separate epic per
  explicit user decision (2026-09-19).

## 7. Admin dashboard conventions (reuse exactly)

- `admin/metrics/page.tsx`: plain async Server Component, no chart lib, `Promise.all`-fetches
  in the RSC body, `<table>` + "no data yet" fallback.
- Nav: hardcoded `<ul>` of `<Link>`s in `admin/page.tsx` — no registry.
- Every mutation in `lib/actions.ts`: `"use server"`, starts with `requireDemoSlug(formData)`
  then `await requireAdminPermission(demoSlug, "mutate")`, then the domain service call, then
  `revalidatePath`.
- No admin CSS file anywhere — plain semantic HTML + scattered inline `style={{}}`.
- `.claude/skills/create-store/SKILL.md` is the one precedent for an agent-facing skill:
  frontmatter + Overview (what's real vs. aspirational) + numbered Steps + Notes.

## 8. Sanity Challenge rules (dev.to, fetched 2026-09-19)

- Deadline: **Oct 4, 11:59 PM PDT**.
- Path One (AI agent via Context MCP + Knowledge Base): judged on Context/KB usage +
  usability. Path Two (vibe-coded Next.js/Astro + Sanity app, bonus App SDK/Workflows): judged
  on build-process writeup honesty, functionality, schema thoughtfulness, creativity.
- Every submission needs a Sanity project ID or public dataset URL, published on DEV.to tagged
  `#sanitychallenge`, using the Challenge's own submission template. $500 × 5 winners.
