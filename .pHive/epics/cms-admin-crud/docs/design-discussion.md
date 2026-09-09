# Design Discussion — Epic 28: `cms-admin-crud`

## 0. Prelude

**Source:** a direct finding from a fresh gap audit (2026-09-08): CMS's own subsystem
(`packages/cms`) is fully capable of creating and publishing pages — `CmsService.createPage`/
`updatePage`/`publishPage`/`createMarketingPage` all already exist and work — but **nobody
ever built an admin UI to call them.** `/admin/cms` is a read-only table. Worse: the AI/MCP
tool `manage_cms_page` only supports `action: "update"|"publish"`, no `"create"`. Today a
custom marketing page can only be authored by hand-editing seed code — neither a human admin
nor an agent can create one.

## 1. Goal

An admin can create, edit, and publish a CMS page (including a marketing/campaign page) from
`/admin/cms`. An agent can do the same through the MCP interface.

## 2. Why this needs no new package or subsystem

Unlike every epic in the 20s wave, **no new domain model or adapter contract is needed here.**
`CmsService`'s public surface already has everything: `createPage(input)`, `updatePage(id,
patch)`, `publishPage(id)`, `createMarketingPage(input)`, `components: ComponentRegistry`
(the list of valid `componentType`s a section can reference). This epic is pure
app-composition-layer work (an admin UI + an MCP tool extension), the same shape epic 25
(admin-adapter-visibility-settings) took when it found no new subsystem was warranted either.

## 3. Design decisions

- **Section (component) editing uses a fixed-slot, raw-JSON-config form** — mirroring
  bundles'/advertising's own "fixed slot count, plain HTML, no client JS" convention for
  nested/variable-shaped data. A `ComponentInstance`'s `config` is `Record<string, unknown>`
  by design (opaque to CMS itself, per `docs/subsystems/05-cms-pages.md`) — there is no single
  schema to build a typed form against across `hero-banner`/`category-spot`/`product-grid`/
  `ad-slot`/`service-area-info`, each with different config shapes. A fixed number of section
  slots, each with a `componentType` `<select>` (populated from
  `cms.components.list()`) and a raw-JSON `<textarea>` for `config` (parsed server-side,
  clear error on invalid JSON) is the honest, simplest form that doesn't require building five
  separate per-component-type editors.
- **Marketing pages get their own create form**, separate from the generic page-create form,
  since `createMarketingPage`'s input shape (`campaignName`, `startDate`, `endDate`,
  `productIds`) is genuinely different from a plain page's.
- **The MCP tool gains a `"create"` action**, matching the existing `action` enum pattern
  already used for `"update"`/`"publish"` on the same tool, rather than a brand-new tool
  definition — keeps one tool per capability area, consistent with how the other 7 tools in
  this interface are scoped.
- **Every new mutation (admin UI and MCP handler alike) is gated by the admin-auth epic's
  `requireAdminPermission("mutate")`**, the same guard every other admin mutation in this repo
  now carries — this epic ships strictly after admin-auth-clerk for that reason.

## 4. Scale assessment

**Small.** No new package. Proceeding with 3 stories: admin UI, MCP tool extension, closeout.

## 5. Version bump

`patch` — additive UI and one new MCP tool action; no change to any package's own public
contract shape (`CmsService`'s methods are unchanged, just finally called from somewhere).
