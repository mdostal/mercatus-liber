# Security Policy

## Supported versions

Mercatus Liber is a fast-moving, pre-1.0 project (currently `0.28.x` — see `CHANGELOG.md`
and `package.json`) with a single active maintainer and no LTS branches. **Only the latest
commit on `main` is supported.** There is no backport policy and no maintained older-version
branch — if you find a vulnerability, the fix will land on `main` and you should update to
pick it up. This is the honest policy for a project at this stage, not a placeholder; it will
change if/when this project reaches a 1.0 release with real version-support commitments.

This applies to the framework itself (everything under `packages/` and `apps/`). If you're
running a store built with `@mercatus-liber/create-store` or self-hosting
`apps/reference-storefront`, the same rule applies: track `main`.

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security vulnerability.** Use GitHub's private
vulnerability reporting feature instead:

**https://github.com/mdostal/mercatus-liber/security/advisories/new**

This opens a private draft security advisory visible only to you and the maintainer, lets you
attach a proof of concept safely, and (once a fix lands) can be published as a coordinated
advisory with proper credit to you as the reporter. This is GitHub's real, built-in mechanism
for exactly this — see [GitHub's own documentation on privately reporting a security
vulnerability](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
if you want the full mechanics before using it.

If, for some reason, the advisory form isn't usable for you, opening a regular GitHub issue
with **no exploit details** (just "I found something I believe is a security issue, how should
I share details") is an acceptable fallback to start a conversation — just don't post the
actual vulnerability details anywhere public.

### What to include

Whatever you can share to help reproduce and assess it:

- What subsystem/package/adapter is affected (e.g. `packages/checkout-orders`,
  `packages/adapter-clerk`, `apps/reference-storefront`'s admin auth gating).
- Steps to reproduce, or a minimal proof of concept.
- What you believe the actual impact is (data exposure, auth bypass, injection, dependency
  vulnerability, etc.).
- Whether it's in this repo's own code or in a dependency (this project also runs `pnpm audit`
  against its own dependency tree as part of normal maintenance — see
  `.pHive/planning/epic-backlog.md` row 69 for a recent real example: 13 real advisories found
  and closed via a `pnpm-workspace.yaml` override).

### What to expect

This is a single-maintainer, unfunded open-source project — there is no security team and no
formal SLA. In good faith, the realistic expectation is:

- An acknowledgment within a few days of a report landing through the private advisory form.
- A real assessment (confirmed, not confirmed, or needs more info) as soon as it's practical to
  investigate — usually within a couple of weeks, faster for anything that looks high-severity.
- A fix timeline communicated once the issue is confirmed, scaled to actual severity — a live
  auth-bypass or data-exposure issue gets prioritized over a low-severity dependency advisory
  with no known exploit path.

If you haven't heard anything after a reasonable amount of time, following up on the same
advisory thread is completely fine — it's not an imposition, it's how a single-maintainer
project stays honest about backlog.

## Scope

In scope: any real vulnerability in this repo's own code (`packages/*`, `apps/*`) or in how it
wires together a real third-party dependency or provider integration (Stripe, Clerk, Sanity,
Postgres/MongoDB/Convex adapters, etc.).

Out of scope: vulnerabilities in a third-party provider's own service (report those to the
provider directly), and the intentionally-insecure, clearly-labeled local-development-only
fallbacks this repo documents on purpose — e.g. `ADMIN_DEV_PASSWORD`'s single shared session
cookie (see `README.md`'s "Configuration" section, which states plainly it is "never a real
security boundary"). Reporting one of those isn't wasted effort, but expect the response to be
"yes, that's documented and intentional for local dev" rather than a fix.

## Disclosure

There's no fixed disclosure-embargo timeline written in stone here (see "What to expect" above)
— for anything genuinely severe, the goal is to get a fix merged and released before any public
detail, and to credit the reporter in the published advisory unless you ask not to be named.
