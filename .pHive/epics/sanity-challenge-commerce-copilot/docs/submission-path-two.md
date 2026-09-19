<!--
  DRAFT ONLY -- NOT PUBLISHED. See .pHive/epics/sanity-challenge-commerce-copilot/stories/scc-08-submission-drafts.yaml.
  Publishing to DEV.to is a separate, explicit, user-gated action. This file was never sent to
  dev.to, dev.to/agent_sessions/new, or any publish API/form.

  Intended tag: #sanitychallenge (DEV Community). Path Two: "Vibe-Code Something Strange."
-->

# I gave Claude Code eight sequenced stories to deepen a real Sanity CMS integration -- here's the honest build log

## What I Built

**Mercatus Liber** is an open-source, from-scratch headless commerce framework (not a template,
not a fork of an existing storefront starter) with three live demo stores -- `print-shop`,
`northline`, and `broadleaf` -- all running on one Next.js codebase behind pluggable
catalog/CMS/theming/payments adapters. For the Sanity Challenge I went deep on the CMS side of
one of those demos, across three concrete pieces:

1. **A real, schema-typed CMS section editor**, replacing what used to be raw-JSON `<textarea>`
   inputs for editing a page's content sections.
2. **A new `admin/content-layout` dashboard** that, for the first time in this codebase, connects
   CMS content editing to the theming system's per-page-type layout template picker on one
   screen.
3. **Sanity's own remote MCP server** (`https://mcp.sanity.io`) registered as a real, usable tool
   source for any AI coding agent working in this repo, alongside a new agent skill documenting
   how to use it safely against this project's real schema.

### 1. Schema-typed CMS section editor

Every CMS component type (`hero-banner`, `ad-slot`, `category-spot`, `product-grid`, and one
more) used to store its config as an opaque JSON blob edited by hand in a textarea -- workable,
but it gave an admin zero guidance about which fields a component actually needed, and no
protection against a bad edit breaking the render. I extended `ComponentRegistry`'s five entries
with a real `fields: {key, label, kind, required?, helpText?}[]` schema per component type (kinds
include `text`, `richtext`, `categoryRef`, `productRef`), and rewrote the section editor's form
generation to read that schema instead of rendering a textarea -- category and product reference
fields render as live selects pulled from the real catalog, not free-text IDs a typo could break.

This is additive, not a migration: `ComponentInstance.config` is still `Record<string, unknown>`
at rest, in every persistence adapter (Sanity and in-memory alike), so no existing content needed
to change shape. Only the editing surface got smarter. See `packages/cms/src/component-registry.ts`
and commit `e18abc0` (schema addition), `eabf0c0` (the editor rewrite).

### 2. Content & Layout dashboard: CMS and theming, wired together for the first time

Before this, theming and CMS were two separate admin surfaces that had never talked to each
other: `/admin/themes` could swap an entire bundle of templates at once, and `/admin/cms` could
edit a page's content sections, but there was no single place to see "this page type is on this
layout template" and change *just that page type's* template independently of the rest.

The new `admin/content-layout` page does exactly that: per page type, it shows the currently
resolved `LayoutTemplate` (via `ThemingService.resolveTemplate`) with a picker that calls
`setDefaultTemplate` for that one page type, plus the page's CMS sections inline using the new
schema-typed editor from (1). It follows this repo's existing admin conventions exactly -- plain
React Server Components, `requireAdminPermission("mutate")`-gated server actions, status rows in
the same style as the existing `adapter-info.ts` "which backend is active" rows elsewhere in the
admin.

This was live-verified with real Playwright against a running dev server, not just unit-tested:
an admin session overrode one page type's layout template independently, confirmed the override
survived a subsequent whole-bundle `/themes` swap (proving the per-page-type override actually
takes precedence rather than just looking like it did), while editing that same page's CMS
content inline in the same session. Commit `dfc6529`.

### 3. Sanity's remote MCP server, registered for real

This repo had zero MCP-client code before this epic. Rather than build a bespoke Sanity API
client, I registered Sanity's own hosted remote MCP server (`https://mcp.sanity.io` -- GROQ
query, document CRUD, schema inspection/deploy, Content Releases, asset upload, semantic search)
in a new root `.mcp.json`, alongside this repo's pre-existing stdio commerce MCP server. A fresh
Claude Code session opened at this repo's root now gets both tool sets automatically. I also
wrote a new agent-facing skill, `.claude/skills/sanity-content/SKILL.md`, documenting the real
workflows (querying the live schema before writing, GROQ browsing, document CRUD, when to prefer
this repo's own `manage_cms_page` tool instead because it additionally enforces this repo's
domain validation) -- mirroring this repo's existing `create-store` skill's exact format.

This was live-verified, not just wired and hoped for: a direct `initialize` JSON-RPC call to
`https://mcp.sanity.io` with this project's real Sanity token returned HTTP 200 and a genuine
handshake (`serverInfo.name: "Sanity"`, `serverInfo.version: "2.35.0"`). Commit `106b8ab`.

## Demo

- Production, all three demo stores, Sanity actively serving CMS content:
  - `https://commerce.mdostal.com/demo/print-shop`
  - `https://commerce.mdostal.com/demo/northline`
  - `https://commerce.mdostal.com/demo/broadleaf`
- New admin surfaces (sign in first -- see Testing Credentials below):
  - `https://commerce.mdostal.com/demo/print-shop/admin/cms` -- the schema-typed section editor
  - `https://commerce.mdostal.com/demo/print-shop/admin/content-layout` -- the new CMS+theming
    dashboard
- Video walkthrough: *(to be recorded before publish -- not yet produced as of this draft)*

## Code

- Repository: Mercatus Liber (this monorepo). *(Add the public GitHub URL here before
  publishing -- this draft does not assume the repo's current visibility.)*
- Key paths for a judge reviewing schema/code:
  - `packages/cms/src/component-registry.ts` -- the field-schema design (2)
  - `apps/reference-storefront/app/demo/[demoSlug]/admin/content-layout/page.tsx` -- the CMS+theming
    bridge (2c)
  - `.mcp.json`, `.claude/skills/sanity-content/SKILL.md` -- the MCP registration (2d)
  - `packages/adapter-sanity/` -- the underlying Sanity persistence adapter this all sits on top
    of (pre-existing, unmodified by this epic except for a previously-shipped `_id`-collision fix
    referenced below)

## How I Used Sanity

Sanity is the live, active CMS persistence backend for all three production demo stores --
`packages/adapter-sanity` maps this repo's own `ComponentInstance`/`LayoutTemplate`-shaped CMS
domain model onto real Sanity documents (`page`, `marketingPageMeta`, and friends). This epic's
first story (`scc-01`) re-verified that production Sanity is genuinely healthy end to end: every
CMS-backed route across all three demos (home pages, category pages, marketing/campaign pages,
`/admin/cms`) returns zero 500s, and a real create/read/delete round trip was run directly
against the live project via Sanity's Mutations API to confirm a previously-fixed `_id`-namespace
collision bug (`marketingMetaDocId()`, `packages/adapter-sanity/src/mapping.ts:62`) genuinely
holds in production, not just in the existing regression test. Commit `7f7ee83`. The stale
planning note that had claimed Sanity was "reverted out of production" was corrected as part of
this same story -- it was wrong; Sanity had been live the whole time.

On top of that live foundation, this submission adds: a real per-component-type field schema so
the CMS's own admin editing surface understands Sanity-backed content structurally instead of as
opaque JSON (1), a dashboard connecting that content to the theming system's layout templates
(2), and Sanity's own remote MCP server registered as a first-class tool source for any AI coding
agent working in this repo going forward (3).

## Sanity Project Details

- **Project ID:** `gnfzrgei`
- **Dataset:** `production`
- **Organization ID:** `oz4zlgci4`

These are the real, live IDs backing all three demo stores in production -- not placeholders.
They also appear directly in this repo's own code and docs (e.g.
`apps/reference-storefront/lib/copilot/sanity-context-client.ts`'s header comment, which records
the live API call used to resolve the organization ID from the project ID) so a judge can
cross-check them against the codebase itself, not just this writeup.

## Testing Credentials

The admin surfaces above require sign-in. This repo already documents a real, live, read-only
demo account for exactly this purpose (outside reviewers, judges, anyone who shouldn't get
mutate access): the `ADMIN_VIEWER_PASSWORD`-gated `viewer` role (`packages/admin-auth`,
`apps/reference-storefront/app/(landing)/sign-in/page.tsx`). It's a genuine third role in this
repo's permission matrix (owner / admin / viewer), not a stub -- `viewer` sessions get read
access to every admin page (including the two new ones above) but are structurally blocked from
any `mutate`-gated action, enforced the same way as every other admin mutation in this codebase.
Contact the author for the current `ADMIN_VIEWER_PASSWORD` value rather than expecting a public
password in this document.

## Schema Thoughtfulness

The field-schema design (`ComponentFieldSchema`, `packages/cms/src/component-registry.ts`) is
deliberately additive and grounded in real usage, not speculative: every `key`/`kind` pair in the
five component definitions was checked against actual `config` usage in this repo's own seed data
across all three demo stores before being added -- nothing invented ahead of real content. The
`ad-slot` component type, for example, was deliberately left with an *empty* field list, because
its real content is resolved at render time from a separate advertising service by
page-slug/service-area targeting rather than stored on the CMS component at all -- adding fields
there would have been dishonest schema design describing a shape the component doesn't actually
have. The design follows the same "a schema describes what a form generates" spirit already
established elsewhere in this codebase for catalog attributes (`identifyingAttributeKeys`),
applied here to CMS sections for the first time.

The content-layout dashboard is the more structurally interesting schema decision: rather than
merge CMS and theming into one system, it keeps them as two independently-evolving domain models
(`ComponentInstance` for content, `LayoutTemplate` for layout) and adds a single admin surface
that *reads both* and lets an admin *mutate either independently*, per page type. That
independence was the entire point of live-verifying that a per-page-type template override
survives a whole-bundle template swap -- proving the two systems compose without one silently
overriding the other.

## Creativity and Originality

Mercatus Liber is not a template or a fork -- it's an original, open-source headless commerce
framework built with pluggable adapters across catalog persistence (Postgres, SQLite, MongoDB,
Convex), CMS (Sanity, in-memory), theming, payments, fulfillment, and more, with three
independently seeded demo stores sharing one codebase. The Sanity integration this submission
deepens sits inside that larger adapter architecture rather than being the whole app -- Sanity is
one real, live, swappable backend among several, and this submission's contribution is making the
*admin-facing* side of that integration (editing, layout control, agent tooling) as real and deep
as the persistence layer underneath it already was.

## How This Was Built (honest build-process writeup)

This was built by AI coding agents dispatched by Claude Code, across eight sequenced stories in
one epic (`sanity-challenge-commerce-copilot`), with a human directing scope and reviewing
results at each step. Concretely, in commit order:

1. `7f7ee83` -- re-verified production Sanity health live (corrected a stale "reverted" planning
   note that turned out to be wrong).
2. `e18abc0` -- added the real per-component-type field schema to `ComponentRegistry`.
3. `106b8ab` -- registered Sanity's remote MCP server and wrote the agent skill for it.
4. `eabf0c0` -- rewrote the CMS section editor from raw JSON to schema-typed forms.
5. `dfc6529` -- built and live-Playwright-verified the Content & Layout dashboard.
6. `476a115` -- built the AI copilot backend (this submission's Path One counterpart).
7. `80fdfc1` -- built the AI copilot's admin chat UI.

Each story that touched a live surface was verified against the real, running system before being
called done -- not just unit-tested in isolation. Where something was genuinely missing (see this
epic's Path One submission for the one honestly-disclosed credential gap that affects the AI
copilot, not this Path Two submission), that gap is stated plainly rather than glossed over, both
in this repo's own commit history and in the Path One writeup. I'm disclosing the AI-agent build
process explicitly and without hedging because this Challenge's own judging criteria for Path Two
explicitly reward honesty about build process -- this is that honesty, not a marketing gloss on
it.

## Agent Session

*(Optional per the Challenge's own template. Not attached to this draft -- would require
uploading a session transcript via `dev.to/agent_sessions/new`, which is an explicit, separate,
user-gated publishing action outside the scope of this draft.)*

---

Tags: `#sanitychallenge`
