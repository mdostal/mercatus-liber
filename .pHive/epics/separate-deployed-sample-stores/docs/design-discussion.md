# Design discussion: separate-deployed-sample-stores (epic 81)

## 1. Why this epic, and why now

Real user ask, 2026-10-15: "sample stores linked out as SEPARATE STORES like i asked" --
explicitly marked as a repeat ask, not yet delivered. Verified the real current state before
planning: all three reference demos (print-shop, northline, broadleaf) are today
`/demo/<slug>` dynamic-route paths inside ONE Next.js app (`apps/reference-storefront`),
deployed as ONE Vercel project (`mercatus-liber-demo`, aliased to `commerce.mdostal.com`).
They share the same domain and the same deployment -- genuinely different per-demo
persistence backends exist (per epic [[feedback-multi-backend-showcase|per-demo-backend-
diversity]]), but they are not independently deployed, independently addressable stores. This
is almost certainly what the repeat ask is about: not code-level backend diversity (already
real), but actually separate, independently-reachable store deployments.

## 2. The design: same codebase, single-tenant mode, separate deployments

Read the real routing before designing around it: `apps/reference-storefront/app/demo/
[demoSlug]/**` is the real page tree; `lib/services.ts`'s `resolveDemoPersistenceEnv`/
`demoEnvPrefix` already give each demo slug its own env-var-prefixed backend override
(`PRINT_SHOP_DATABASE_URL`-style, confirmed by reading `services.ts` directly) -- the
per-store backend-diversity plumbing this needs already exists.

**Chosen approach: do not fork the codebase three times.** Add a real single-tenant mode to
the same app: an env var (e.g. `SINGLE_TENANT_DEMO_SLUG=print-shop`) that, when set, makes the
app serve that one demo's content directly at `/` (via a middleware rewrite reusing the exact
same `/demo/[demoSlug]/**` page tree, just rewriting the incoming path to prepend
`/demo/print-shop` before Next's router sees it) instead of requiring the `/demo/<slug>`
prefix. Verify the real current `middleware.ts` (already read: it matches `/demo/:demoSlug/
admin(.*)` for the Clerk gate) composes cleanly with an added rewrite rule -- a rewrite needs
to run for every other route too, not just admin, so this needs its own matcher covering
everything, done carefully alongside the existing admin matcher, not replacing it.

Deploy the SAME repo as **three new, separate Vercel projects** (not three new codebases):
one per store, each with `SINGLE_TENANT_DEMO_SLUG` set to its own slug, each with Root
Directory `apps/reference-storefront` (same as today's `mercatus-liber-demo` project), each
with its own independently-set backend env vars (reusing the existing per-demo-prefix
convention, just without needing the prefix anymore since each deployment only ever serves
one demo -- or keep the prefixed names for consistency with the existing shared deployment,
decide during implementation whichever is less error-prone). Each gets its own real URL.

**Domains: default to Vercel-provided `*.vercel.app` URLs, no new DNS or domain purchase,**
unless the user asks for custom subdomains under `mdostal.com` later -- this avoids a cost/DNS
decision this epic doesn't need to force. The existing `commerce.mdostal.com` multi-tenant
`/demo/<slug>` paths stay exactly as they are (additive, not a replacement) -- nothing currently
linking to them breaks.

## 3. Scope

**In scope:**
1. Add the single-tenant middleware rewrite mode to `apps/reference-storefront`, gated
   entirely behind the new env var -- when unset, behavior is byte-identical to today (the
   existing shared `commerce.mdostal.com` deployment must be completely unaffected).
2. Real test: with the env var set, a request to `/` renders the same content as today's
   `/demo/<slug>` for that slug; with it unset, `/` renders today's existing framework landing
   page unchanged.
3. Create three new real Vercel projects from this repo (`mercatus-liber-print-shop`,
   `mercatus-liber-northline`, `mercatus-liber-broadleaf` or similar real names), each single-
   tenant-mode, each independently deployed, each live-verified to actually serve that one
   store at its own root URL with real content (not a redirect back to the shared deployment).
4. Link all three new URLs from: the main `commerce.mdostal.com` site (its own existing demo-
   links section), the docs site, and the wiki (coordinate with epic 80 -- land this epic's
   real URLs before or alongside epic 80's cross-linking story, whichever lands second updates
   the other).

**Explicitly out of scope:**
- Custom domains/subdomains -- Vercel-provided URLs are the default; revisit only if asked.
- Any change to which backend each demo uses -- that's already decided (per-demo-backend-
  diversity epic); this epic only changes *how many deployments* exist, not *what each runs on*.
- The merch/dropship store (`shop.mdostal.com`) -- that's a separate real business, already its
  own separate deployment, already satisfies "separate store" on its own; not in scope here.

## 4. Risks

| Risk | Mitigation |
|---|---|
| The single-tenant rewrite breaks the existing shared `/demo/<slug>` behavior on `commerce.mdostal.com` | Gate entirely behind the new env var being unset by default on the existing project; real regression test proves byte-identical behavior when unset |
| Admin auth (Clerk) matcher assumptions baked into `/demo/:demoSlug/admin` break under a rewritten path | Test the admin route specifically under single-tenant mode, not just the shopper-facing pages |
| Three new free deployments is still three more things to keep healthy | Directly connects to epic 79's keep-alive job -- extend it to cover these once they exist, don't build a second, separate health mechanism |

## 5. Scale assessment

**Medium-large.** One real, carefully-scoped routing change (additive, env-gated) plus three
new but straightforward deployments reusing an existing, already-working build. Proceeding
directly to stories given the medium-scope precedent already used this session for sibling
epics 77-80.
