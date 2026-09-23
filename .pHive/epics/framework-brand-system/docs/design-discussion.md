# Design Discussion: framework-brand-system

## 0. Prelude

No separate research-brief written for this pass -- the relevant real state was
already confirmed directly against the live code/deployment this same session
(see citations inline below) rather than delegated to a separate researcher
persona; this repo's actual working pattern all session has been direct,
verified investigation by the orchestrator, not simulated sub-agent personas
this environment doesn't actually have running infrastructure for.

## 1. Goal

Give Mercatus Liber -- the framework itself, not any one demo store -- a real,
deliberate visual identity: a color/type/spacing system, a real favicon/logo
mark, applied to the framework's own landing page (`app/(landing)/**`) and the
Nextra docs site (`apps/docs`). Per the epic-backlog row 55 this fulfills,
explicitly sequenced last, once there was real substance to point at -- which
now genuinely exists (3 real live demo stores, real checkout, real admin, a
real per-store `/start` onboarding page, real Sanity CMS depth, an AI content
copilot, and today's 4 major production bug fixes, all live and public on
GitHub).

**Explicitly out of scope**: any of the 10 existing per-demo-store theme
bundles (`packages/theming/src/theme-bundles.ts` -- classic/dark/minimal/
vibrant/retro/high-contrast/northline/editorial/maximalist/datasheet). Those
are each demo store's OWN identity, deliberately distinct from each other and
from the framework's own brand -- this epic must not touch, override, or
visually collide with any of them.

## 2. Proposed approach

### 2a. Real brand identity, grounded in the project's actual character

"Mercatus Liber" -- Latin, "free market." A genuinely free, MIT-licensed,
open-source headless commerce framework (not a SaaS product, no paid tier
baked into core, per `README.md`/`VISION.md`'s own north star). Primary
audience: developers evaluating whether to adopt it -- technical, but the
project's own voice throughout `README.md`/`VISION.md`/this epic's own commit
history is direct and confident, not corporate-cold. The brand needs to read
as credible engineering (not a marketing veneer over thin content -- there
isn't one; the framework is real) while staying legible next to 10 already-
loud, very different demo-store themes it sits above, not beside.

Real color/type direction: a restrained, code-adjacent palette (the project's
own domain is developer tooling) with one confident accent -- avoiding the
generic AI-generated-design tells already named in this session's own
`artifact-design` skill guidance (warm cream + serif + terracotta; near-black
+ one neon pop; Inter/Space Grotesk as the "safe" default) in favor of
something that reads as a deliberate choice for THIS project specifically. A
monospace or semi-monospace accent face for code-adjacent UI chrome (nav,
labels) paired with a plain, highly legible body/heading face fits a
framework whose own real differentiator is architecture (schema-first
catalog, marketing-catalog genuinely separate from sales catalog, adapter-
swappable everything) -- the typography itself can signal "built by and for
people who read code."

### 2b. Logo mark -- real, disclosed gap on AI image generation

The `openai-image` MCP tool (needed for `plugin-hive:logo-exploration`'s real
image-generation path) is disconnected in this environment -- checked live
just now, confirmed still unavailable, not assumed from an earlier session
note. Rather than fake this or silently skip it, this epic ships a real,
well-reasoned **typographic wordmark** instead of an icon mark -- a
legitimate, common choice for real open-source infrastructure projects (many
ship wordmark-only identities). If `openai-image` reconnects in a future
session, icon-mark exploration is real, disclosed follow-on work, not
something this epic claims falsely to have done.

### 2c. Application surfaces

1. `.pHive/brand/brand-system.yaml` -- the real token source of truth (colors,
   type, spacing), following this plugin's own `plugin-hive:brand-system`
   skill's output shape.
2. `.pHive/brand/brand-guide.html` -- a real, visual HTML brand guide (not
   just the YAML) for actually reviewing the choices.
3. `apps/reference-storefront/app/(landing)/**` -- the framework's own
   landing page (distinct from any demo store), using the new tokens.
4. `apps/docs` -- the Nextra docs site's own layout/styling.
5. A real favicon (`apps/reference-storefront/app/icon.tsx` or `favicon.ico`
   -- confirmed which convention this app actually uses before implementing,
   not assumed).

## 3. Dependencies

Epic 0 (the landing page itself, from `commerce-landing-and-demo-routing`)
and epic 33 (`docs-site`) -- both already done, this epic styles surfaces
they already built. Does not depend on or modify `packages/theming`'s
demo-facing bundle system.

## 4. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Brand tokens visually leak into or collide with a demo store's own theme | Medium | Scope every change to `app/(landing)/**` and `apps/docs` only; explicit story-level check that no `packages/theming` file is touched |
| No real icon/logo mark deliverable without `openai-image` | Low | Real, disclosed substitution: a genuine typographic wordmark, not a placeholder or a fake claim |
| Landing page redesign looks generic/AI-templated | Medium | Explicit design-plan step naming real, project-specific choices (per `artifact-design` skill guidance already established this session) before implementation, not a freehand pass |

## 5. Scale assessment

**Medium.** Multi-file (landing page, docs site, new brand-system artifacts,
favicon), single conceptual layer (visual identity/presentation, no new
architecture or data model), no cross-stack persistence/backend changes.
Proceeding directly to story decomposition -- no H/V slicing or structured
outline needed for a scope this contained.
