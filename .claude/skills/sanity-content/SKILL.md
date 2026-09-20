---
name: sanity-content
description: Query and edit this project's Sanity content -- live schema, documents, and Content Releases -- via Sanity's own registered remote MCP server, and know when to use it versus this repo's manage_cms_page tool instead.
---

## Overview

Sanity runs a real, hosted MCP server at `https://mcp.sanity.io` (GROQ query, document CRUD,
schema inspection/deploy, Content Releases, asset upload, semantic search over embeddings; OAuth
or bearer-token auth). It is registered in this repo's root `.mcp.json` under the `sanity` key,
alongside this repo's own commerce MCP server (`reference-storefront-commerce`, the same
`apps/reference-storefront/mcp-server.ts` process previously only reachable by manually running
`pnpm mcp`). A fresh Claude Code session opened at this repo's root gets both tool sets
automatically -- no server-side code changes were needed for either registration.

**Verified, not aspirational:** on 2026-09-19, `sanity`'s connection was live-tested with a real
credential (`mercatus-liber-sanity-token` in Portunus's `mercatus-liber-commerce` vault -- the
same token `apps/reference-storefront/lib/services.ts:709-714` already uses for `SANITY_TOKEN`
when wiring the real Sanity CMS adapter). A direct `initialize` JSON-RPC call to
`https://mcp.sanity.io` with that token returned HTTP 200 and a genuine Sanity MCP handshake
(`serverInfo.name: "Sanity"`, `serverInfo.version: "2.35.0"`, plus the server's own tool-use
instructions). What is **not** verified: an actual Claude Code session loading this `.mcp.json`
end to end (this session's own MCP config was fixed before this file existed, so it could not
self-test the load path), and whether `mercatus-liber-sanity-token`'s scope covers every tool
category below (see Notes) -- only that the handshake itself succeeds.

## Steps

### 1. Confirm both MCP servers are connected

In a fresh Claude Code session opened at this repo's root, check the connected MCP servers (the
harness typically surfaces this at session start, or via whatever `/mcp`-equivalent status
command the client exposes). You should see both `reference-storefront-commerce` (stdio,
`pnpm --filter @mercatus-liber/reference-storefront mcp`) and `sanity` (remote HTTP,
`https://mcp.sanity.io`). If `sanity` fails to connect, see Notes for the credential setup it
needs.

### 2. Query the live schema before writing anything

Before creating or patching a document, use the Sanity MCP server's schema tool (`get_schema` in
the server's own naming, confirmed present in its `initialize` instructions text) to fetch the
deployed schema for this project's dataset. Don't assume field names from memory or from another
Sanity project -- this project's actual schema lives in whatever Sanity Studio config was used to
deploy it (not part of this monorepo's own source tree; it's stored on Sanity's side and fetched
live through the MCP tool).

### 3. Browse and query content with GROQ

Use the Sanity MCP server's query tool to run GROQ queries scoped to this project's dataset
(`SANITY_DATASET`, defaulting to `"production"` per
`apps/reference-storefront/lib/services.ts:707-712`). This is read-only and safe to run freely --
it's the same kind of operation `search_products`/`get_product` are on the commerce server side,
just against CMS content instead of catalog data.

### 4. Mutate content (create, patch, publish) via the Sanity MCP tools

Use the Sanity MCP server's document CRUD and Content Releases tools directly for anything that's
purely a CMS-content change with no cross-subsystem effect -- e.g. editing a marketing page's
copy, adjusting an image asset, staging a draft in a Content Release before publish. These tools
write straight to Sanity, bypassing this repo's own `cms` package entirely.

### 5. Use `manage_cms_page` instead when the change needs to go through this repo's CMS service

`manage_cms_page` (`packages/ai-interface/src/tool-definitions.ts:139`, exposed by the
`reference-storefront-commerce` MCP server) is this repo's own framework-level tool for
create/update/publish on a CMS page. It calls into `createCmsService` (wired in
`apps/reference-storefront/lib/services.ts:717-720`), which in turn calls whatever
`cmsPersistence` backend `services.ts:709-715` selected -- the real Sanity adapter when
`SANITY_PROJECT_ID` is set (same env var family as this skill's `sanity` MCP entry), or an
in-memory fallback otherwise. Confirmed by reading that file directly, not inferred: when Sanity
is the active backend, `manage_cms_page` and the `sanity` MCP server's document tools are two
different front doors onto the **same underlying Sanity project** -- `manage_cms_page` additionally
enforces this repo's own domain rules (`requiresConfirmation: true` -- it returns a preview unless
called with `confirm: true`, per its `tool-definitions.ts` entry) and goes through
`createCmsService`'s component-registry validation, whereas the raw Sanity MCP tools do not know
about either. Prefer `manage_cms_page` for anything a human-facing storefront page render depends
on (so it's validated the same way a human admin's edit would be); prefer the `sanity` MCP tools
directly for anything Sanity-specific that this repo's `cms` package doesn't model (Content
Releases, schema deploy, asset upload, semantic search).

### 6. Escalate schema or project-level changes carefully

Schema deploy, dataset creation, and project/org management are real capabilities of the Sanity
MCP server (per its own `initialize` instructions text) but are structurally different in blast
radius from a document edit -- they change what the *whole* project's schema or topology looks
like, not one page's content. Confirm with the human before invoking these, the same
confirm-before-mutate posture `manage_cms_page` already enforces for storefront-side CMS writes.

## Notes

- **Credential used:** `SANITY_TOKEN`, sourced from Portunus's `mercatus-liber-commerce` vault as
  `mercatus-liber-sanity-token` ("Sanity API token (editor access) for mercatus-liber CMS"). This
  is the *same* token `services.ts` already uses for the app's own Sanity adapter -- there is no
  separate, purpose-built "MCP-scoped" Sanity token in Portunus today, and none was fabricated for
  this story. `.mcp.json`'s `sanity` entry reads it via `${SANITY_TOKEN}` expansion (Claude Code
  expands `${VAR}` in `.mcp.json` `headers`/`url` fields from the environment Claude Code itself
  was launched with).
- **Confirmed failure mode, 2026-09-19 (this is the end-to-end test this skill's Overview flagged
  as not yet done):** a real Claude Code session loaded this `.mcp.json` and the `sanity` server
  failed with `AUTH_HEADER_REJECTED` / HTTP 401 `invalid_token` -- NOT the credential-denylist risk
  flagged above, and NOT a bad/expired token (the token itself was independently re-verified live
  and still works, per the Overview's handshake test). Root cause, directly confirmed: `SANITY_TOKEN`
  was simply never exported into the shell environment Claude Code was launched from, so
  `${SANITY_TOKEN}` expanded to empty/invalid, which Sanity correctly rejected. **Fix:** export the
  var in the shell *before* starting Claude Code (a fresh terminal, or your shell profile for it to
  persist) -- this must be run by the human directly, never by an agent, since `portunus resolve`
  prints the raw secret to stdout with no redaction:
  ```
  export SANITY_TOKEN="$(portunus resolve '{{secret:mercatus-liber-sanity-token}}')"
  ```
  Then restart Claude Code (or reconnect the `sanity` MCP server via whatever `/mcp`-equivalent
  reconnect command the client exposes) for the new env var to be picked up -- `.mcp.json` env
  expansion happens at connection time, not on a running session.
- **Scope gap, honestly disclosed:** `mercatus-liber-sanity-token` is described in Portunus as
  "editor access," which the live `initialize` handshake confirms is enough to *connect* and
  should cover GROQ query, document CRUD, and Content Releases. It was **not** tested against
  schema-deploy or project/dataset-management calls in this story -- those may need a token with
  broader (e.g. Administrator) scope. If a schema-deploy call fails with an authorization error,
  that's this gap surfacing, not a broken registration -- get a higher-scoped token from
  `sanity.io/manage` or the Sanity CLI's `tokens` command and update
  `mercatus-liber-sanity-token` in Portunus (don't add a second, differently-named secret for the
  same purpose).
- **Dataset scoping:** the `sanity` MCP server is not dataset-locked by this repo's config -- every
  call that touches content must pass the right project/dataset explicitly (per the server's own
  `initialize` instructions: "pass `resource` each call; no defaults persist"). Use
  `SANITY_PROJECT_ID`/`SANITY_DATASET` (Portunus: `mercatus-liber-sanity-project-id`,
  `mercatus-liber-sanity-dataset`) as the source of truth for which project/dataset this repo's
  own Sanity wiring targets, and pass those same values to the MCP tools -- don't let an agent
  guess or default to a different project.
- **No OAuth fallback exercised:** Sanity's MCP server supports OAuth as its default auth mode
  when no `Authorization` header is configured. This repo's `.mcp.json` always sends the bearer
  token instead, so the OAuth device-flow path was not exercised or verified here -- if
  `SANITY_TOKEN` is unset, expect Claude Code to either fail the connection or prompt an OAuth
  flow depending on client version, not a documented, tested behavior of this skill.
- If this skill file is old, reconfirm the Sanity MCP server's actual tool names by reading its
  live `initialize` response's `instructions` text (or a `tools/list` call) rather than trusting
  the names paraphrased above -- Sanity may rename or add tools after this was written.
