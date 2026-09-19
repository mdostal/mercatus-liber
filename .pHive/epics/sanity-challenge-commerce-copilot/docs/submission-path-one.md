<!--
  DRAFT ONLY -- NOT PUBLISHED. See .pHive/epics/sanity-challenge-commerce-copilot/stories/scc-08-submission-drafts.yaml.
  Publishing to DEV.to is a separate, explicit, user-gated action. This file was never sent to
  dev.to, dev.to/agent_sessions/new, or any publish API/form.

  Intended tag: #sanitychallenge (DEV Community). Path One: "Ship an Agent That Queries Real Content."

  This draft states a real, disclosed gap plainly, per explicit instruction: no live Anthropic
  API key and no configured Sanity Context Knowledge Base exist in this environment. Do not
  soften or remove this disclosure before publishing.
-->

# An admin content copilot for a real Sanity-backed storefront -- built and tested end to end, with one honest gap disclosed up front

**Read this first, because it matters more than the rest of the writeup:** this submission is
built, wired, and tested end to end -- tool-calling loop, Sanity Context MCP client, permission
gating, and the real content/layout write path all exist as real code and pass real tests. What
it does **not** have, in this environment, as of this draft: a live Anthropic API key, and a
configured Sanity Context Knowledge Base to query. Those two specific pieces -- the actual model
call, and the actual Sanity Context semantic search -- have never been exercised against the real
live services in this environment. Everything else described below has been. I'm stating that
distinction explicitly and keeping it that way through the rest of this document, because
blurring it would misrepresent what was actually demonstrated.

## What I Built

An admin chat interface (`admin/copilot`) for Mercatus Liber, an open-source headless commerce
framework, where an admin describes a desired content or layout change in plain language (e.g.
"make the home page hero more seasonal") and the agent:

1. Reads the page's current CMS sections and current layout template via this repo's own real
   `CmsService`/`ThemingService`.
2. Optionally searches Sanity's Context MCP (Knowledge Base mode) for background.
3. Proposes 2-3 concrete candidate options, in one of two deliberately fixed shapes
   (`swap_hero_copy` or `swap_template`) -- not open-ended, unbounded generation.
4. Lets the admin apply one, which writes back through the same `CmsService`/`ThemingService`
   used everywhere else in this app, gated behind the same `confirm:true` +
   `requireAdminPermission("mutate")` discipline every other admin mutation in this codebase
   already follows.

This closes the loop into this epic's Path Two submission's Content & Layout dashboard: an option
applied through the copilot shows up there on next load, because both surfaces write through the
exact same service layer.

## Demo

**Live-verified, end to end, with two clearly-scoped fake-LLM substitutions, both disclosed:**

1. The full request → propose → apply loop, through the real admin chat **UI**, was proven live
   against a running dev server using Playwright, with a temporary fake `AnthropicClient` standing
   in for the real Anthropic API call (because no live Anthropic credential exists in this
   environment -- see Gap Disclosure below). That fake was explicitly temporary, used only for
   this one manual verification pass, and was reverted before the UI commit (`80fdfc1`) landed --
   it is not present in the shipped code. What it proved, for real: a request typed into the chat
   UI produced 3 real candidate option cards rendered in the UI (not raw JSON), applying one
   triggered a real write through `CmsService`, and that write was reflected in the Content &
   Layout dashboard afterward. Separately, a viewer-role (read-only) session was confirmed to be
   genuinely blocked from applying an option -- the permission gate held under a real session, not
   just in a unit test.
2. Separately, and unlike (1), a **permanently shipped** scripted fake `AnthropicClient` does
   exist in the repo: `apps/reference-storefront/lib/copilot/dev-roundtrip.ts`, runnable via
   `pnpm copilot:roundtrip`, drives the same tool-calling loop at the CLI level (no UI) against
   real, in-memory-backed `CmsService`/`ThemingService` instances, with the same disclosed-gap
   posture -- it uses the scripted fake by default, and automatically uses a real Anthropic call
   instead if `ANTHROPIC_API_KEY` happens to be set when it runs. This script is openly documented
   as a fake-LLM stand-in in its own header comment, not concealed -- but it is a genuinely
   different thing from (1)'s reverted Playwright fake, and a judge reading this repo's code
   should know both exist for different purposes: (1) proved the UI, (2) is a repeatable CLI
   regression check.

- Admin UI (requires sign-in -- see Testing Credentials below):
  `https://commerce.mdostal.com/demo/print-shop/admin/copilot`
- **As currently deployed, this page most likely shows an honest "AI copilot is not configured
  for this environment" state.** The only Anthropic-credential check actually performed
  (real, not assumed) was against this repo's own Portunus secret vault, which has no Anthropic
  key scoped to this project -- `ANTHROPIC_API_KEY` on Vercel Production specifically was not
  independently re-checked as part of this story, but every other credential this app uses in
  production was provisioned from that same vault, so the same gap almost certainly applies there
  too. The page itself says this explicitly rather than failing silently or faking a response
  either way -- if a judge visits this URL and sees a live chat instead of that message, an
  `ANTHROPIC_API_KEY` was set on Vercel after this draft was written, not before.
- Video walkthrough: *(not yet produced as of this draft -- would need to be recorded either
  against the reverted fake-LLM dev-server setup with clear on-screen disclosure, or after a real
  Anthropic key is provisioned)*

## Code

- Repository: Mercatus Liber (this monorepo). *(Add the public GitHub URL here before
  publishing.)*
- Key paths for a judge reviewing the implementation:
  - `apps/reference-storefront/lib/copilot/loop.ts` -- the manual Anthropic tool-calling loop
  - `apps/reference-storefront/lib/copilot/sanity-context-client.ts` -- the Sanity Context MCP
    client (generic JSON-RPC, not a hardcoded/guessed tool name -- see its own header comment for
    why)
  - `apps/reference-storefront/lib/copilot/anthropic-client.ts` -- the injectable Anthropic SDK
    wrapper (real SDK-backed implementation; every unit test in this repo uses a fake instead,
    because no live key exists to test against)
  - `apps/reference-storefront/lib/copilot/handlers.ts`, `tool-definitions.ts` -- the
    `propose_options`/`apply_option` tools and the confirm-then-mutate gate
  - `apps/reference-storefront/lib/copilot/dev-roundtrip.ts` -- the CLI-level scripted round trip
    (`pnpm copilot:roundtrip`), a permanently-shipped, openly-disclosed fake-LLM CLI check
    (distinct from the temporary Playwright fake described under Demo)
  - `apps/reference-storefront/app/demo/[demoSlug]/admin/copilot/` -- the chat UI

## How I Used Sanity Context / Knowledge Bases

**What was proven live:** the Sanity Context MCP *router* itself is real and reachable. A direct
call was made to resolve this project's real organization ID (`oz4zlgci4`) from its project ID
(`gnfzrgei`) via `GET https://api.sanity.io/v2021-06-07/projects/gnfzrgei`, then a real MCP
`initialize` request was POSTed to
`https://api.sanity.io/v1/context/organizations/oz4zlgci4/mcp/default`. That returned a genuine,
structured MCP-protocol response: HTTP 200 with
`{"jsonrpc":"2.0","error":{"code":-32001,"message":"MCP endpoint not found: default"}}`. That
specific response is meaningful, not a dead end -- it's a real JSON-RPC error from Sanity's own
Context router, proving the endpoint itself is live and speaking the MCP protocol correctly. It
also proves the actual limitation: **no Knowledge Base MCP endpoint has been configured for this
organization** (a one-time setup step in Sanity's own Manage console under Context/Knowledge
Bases that was never done for this project), and the only Sanity credential available in this
environment (`mercatus-liber-sanity-token`) is a project-scoped "developer" token, not the
org-scoped "Context Viewer" token Sanity's own docs say Context MCP requires.

Because of that, the Sanity Context client (`sanity-context-client.ts`) was built as a generic,
protocol-correct MCP JSON-RPC client -- `initialize` → `tools/list` → `tools/call` against
whichever listed tool name matches a search/query heuristic, rather than a tool name hardcoded
from documentation that was never cross-checked against a real, configured endpoint. It is fully
unit-tested against an injected fake implementing the same interface. **It has never returned a
real Knowledge Base search result in this environment**, because no Knowledge Base exists to
query yet. If a judge or the project owner configures a Knowledge Base and an org-scoped Context
Viewer token after this submission, this client is designed to work against them without any
caller-side changes -- but that is a claim about the code's design, not a demonstrated result.

## Gap Disclosure (stated plainly, not hedged)

Two specific things were **not** exercised live in this environment, and I want to be exact about
which two, because everything else in this submission genuinely was:

1. **No live Anthropic API call was ever made.** A real Portunus secret-vault check of this
   project's credential store found Clerk, Sanity, PostHog, Supabase, Convex, and MongoDB
   credentials, but no Anthropic API key scoped to this project. One Anthropic key exists in the
   broader environment (`demo-shared-anthropic`), but it is explicitly scoped to a different
   project ("LLM calls across a separate multi-agent swarm") and was deliberately not reused here
   -- reusing a credential scoped to unrelated infrastructure would have been the wrong call even
   if it happened to work. `AnthropicClient` (the real SDK-backed implementation) is fully
   written and exists in the shipped code; it has simply never been invoked with a real key.
2. **No Sanity Context Knowledge Base search has ever returned real results.** As described
   above, the Context MCP router responds live, but no Knowledge Base is configured for this
   organization and no token with the required scope exists to use one if it were.

What genuinely **was** proven live, end to end, against real running services: the admin chat UI
rendering real candidate option cards, the propose/apply flow, the write path through the real
`CmsService`/`ThemingService` (verified by reading the result back afterward, not just trusting
the write succeeded), the `confirm:true`/permission-gate rejection path under a real viewer-role
session, and the Sanity Context MCP router itself responding with a real, correctly-formed
protocol error. The only substitution used anywhere in that live verification was a temporary,
explicitly-scoped-and-reverted fake LLM client standing in for the one missing piece (the model
call itself) -- and that substitution is disclosed here, not concealed.

## Usability

The chat surface is this repo's first client-side-interactive admin component -- every other
admin page in this codebase is a plain server-rendered form with server actions, which can't
stream a multi-turn conversation. That departure is called out explicitly in the code's own
comments, not introduced silently. Candidate options render as real preview cards (headline/
subheadline text for a hero-copy swap, or a named template for a template swap) rather than raw
JSON, so an admin doesn't need to understand the underlying tool-call shapes to use it. The
"not configured" state (shown today, given the credential gap above) is itself a deliberate
usability decision -- it tells an admin exactly what's missing and why, in the same honest style
this codebase already uses for every other optional adapter (payments, analytics, etc.) when its
credential is absent, rather than either crashing or silently pretending to work.

## Sanity Project Details

- **Project ID:** `gnfzrgei`
- **Dataset:** `production`
- **Organization ID:** `oz4zlgci4`

Same real project backing this epic's Path Two submission -- this is one integration effort
submitted across both Challenge paths, not two unrelated projects.

## Testing Credentials

The admin copilot page requires sign-in. This repo already has a real, live, read-only demo
account documented for exactly this purpose: the `ADMIN_VIEWER_PASSWORD`-gated `viewer` role
(`packages/admin-auth`). A `viewer` session can open `/admin/copilot` and see the "not configured"
state (or, if an Anthropic key is later provisioned, use the chat) but is structurally blocked
from applying any option -- this was directly verified, not assumed. Contact the author for the
current `ADMIN_VIEWER_PASSWORD` value.

## Agent Session

*(Optional per the Challenge's own template. Not attached to this draft -- would require
uploading a session transcript via `dev.to/agent_sessions/new`, an explicit, separate, user-gated
publishing action outside the scope of this draft.)*

## Build Process

Built by AI coding agents dispatched by Claude Code as two sequenced stories within the larger
`sanity-challenge-commerce-copilot` epic:

- `476a115` -- the copilot backend: tool-calling loop, Sanity Context MCP client, `CmsService`/
  `ThemingService` read tools, `propose_options`/`apply_option`, unit-tested against injected
  fakes for both the Anthropic client and the Sanity Context client.
- `80fdfc1` -- the admin chat UI, wired to the backend, live-Playwright-verified end to end with
  the temporary reverted fake LLM client described above.

The credential gap described in this document was checked for directly (a real Portunus vault
query, not an assumption) before either story concluded it should proceed as a disclosed gap --
consistent with how this same codebase has disclosed similar external-credential gaps in prior,
unrelated epics.

---

Tags: `#sanitychallenge`
