# Vertical Plan: sanity-challenge-commerce-copilot

Each slice leaves the product in a genuinely working state, per the vertical-slice invariant.

## Slice 1 — Sanity production health verified (real, working)
Live-check production with Sanity active; fix forward if broken. Working state: a demo store's
CMS pages provably render from real Sanity data in production with zero 500s.

## Slice 2 — Schema-typed CMS section editor (real, working)
`ComponentRegistry` field schemas + `CmsSectionFields.tsx` generates real per-type forms.
Working state: an admin can edit every existing section type through real typed fields, no raw
JSON, for at least one flagship demo — existing pages continue to render identically (schema is
additive to `config`'s existing shape).

## Slice 3 — Content & Layout dashboard (real, working)
New admin page connecting CMS sections (slice 2) + theming's per-page-type template picker.
Working state: an admin can independently swap one page type's layout template AND edit its
sections from one real dashboard page, live-verified against a running dev server.

## Slice 4 — Sanity remote MCP registered (real, working)
`.mcp.json` + `sanity-content` skill. Working state: a fresh Claude Code session in this repo
has both the commerce MCP server and Sanity's remote MCP available simultaneously, documented
and demonstrated (e.g. querying the live schema through it).

## Slice 5 — AI copilot backend (real, working, narrow first scope)
Anthropic SDK tool-calling loop + Sanity-Context-MCP client + propose/apply tools per design
discussion §2e's narrowed scope. Working state: a scripted/CLI-level round trip (no UI yet)
proves the loop genuinely proposes options and applies one against the real CmsService.

## Slice 6 — AI copilot admin chat UI (real, working)
Chat surface in `admin/copilot`, wired to slice 5's backend, closing the loop into slice 3's
dashboard. Working state: a live admin session can describe a change, see multiple real
generated options, and apply one — verified against a running dev server end to end.

## Slice 7 — Both DEV.to submission drafts (real, complete, unpublished)
Two local markdown drafts under this epic's `docs/`, following the Challenge's own templates,
citing real project ID/dataset and everything built in slices 1-6. Working state: both drafts
are genuinely submission-ready (nothing invented, every claim traceable to a real, verified
slice above) — publishing itself stays a separate, explicit user-gated action.
