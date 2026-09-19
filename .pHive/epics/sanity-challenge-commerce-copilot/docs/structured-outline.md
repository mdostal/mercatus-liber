# Structured Outline: sanity-challenge-commerce-copilot

## 1. Approach

Follow the vertical plan's 7 slices in order, with slice 4 (MCP registration) executed in
parallel with slices 1-3 since it has no cross-dependency. Every mutation-capable surface this
epic adds reuses the existing `requireDemoSlug` → `requireAdminPermission("mutate")` →
domain-service-call → `revalidatePath` pattern verbatim (`lib/actions.ts`'s established
convention) — no new authorization model is invented anywhere in this epic. Every new
admin-facing page follows the existing plain-RSC, no-chart-lib, no-CSS-file convention
(`admin/metrics/page.tsx`'s shape) except the copilot chat UI (slice 6), which genuinely needs
a client component for streaming/interactivity — the first client-side admin component in this
repo, called out explicitly as a convention departure, justified by necessity (a form POST
can't stream a conversation).

## 2. File manifest (representative, not exhaustive — story YAMLs carry full detail)

| Area | Files |
|---|---|
| CMS schema | `packages/cms/src/component-registry.ts` (extend), `packages/cms/src/types.ts` (add `ComponentFieldSchema`) |
| Section editor | `apps/reference-storefront/app/demo/[demoSlug]/admin/cms/CmsSectionFields.tsx` (rewrite form generation) |
| Content & Layout dashboard | `apps/reference-storefront/app/demo/[demoSlug]/admin/content-layout/page.tsx` (new), `lib/actions.ts` (add `setPageTemplateAction`) |
| MCP registration | repo-root `.mcp.json` (new), `.claude/skills/sanity-content/SKILL.md` (new) |
| Copilot backend | new `apps/reference-storefront/lib/copilot/` (client, tools, loop), `package.json` (`@anthropic-ai/sdk` dep) |
| Copilot UI | `apps/reference-storefront/app/demo/[demoSlug]/admin/copilot/page.tsx` (new, client component), a streaming route handler (`app/api/copilot/route.ts` or server action equivalent) |
| Submission drafts | this epic's `docs/submission-path-two.md`, `docs/submission-path-one.md` |

## 3. Risk registry

See design discussion §4 — carried forward unchanged; no new risks surfaced during outlining
beyond what design discussion already named. Highest-severity: Oct 4 deadline vs. the AI
copilot's genuinely novel scope (mitigated by sequencing Path Two to completion first, so a
demoable, submittable "deep store" exists independent of Path One's outcome).

## 4. Elicitation (self-administered — no separate reviewer team available this session)

**Q: Is the schema-typed CMS editor (slice 2) really necessary, or could the dashboard (slice 3)
just wrap the existing raw-JSON editor?**
A: The user's own words were "build dashboards and swap around areas and layouts" — a raw-JSON
textarea inside a nicer page wouldn't satisfy that; the editing surface itself has to genuinely
improve. Keeping slice 2 as a real prerequisite to slice 3.

**Q: Does the AI copilot need to write directly to Sanity, or to Mercatus Liber's own
CmsService?**
A: Mercatus Liber's own CmsService — Sanity is one interchangeable persistence backend behind
that service (per-demo, per research brief §1); writing through the service keeps the copilot
backend-agnostic and reuses the exact same admin-mutation discipline as every other admin
action, rather than a parallel Sanity-specific write path.

**Q: Should slice 5/6 block the whole epic if the LLM integration proves harder than expected?**
A: No — slices 1-4 (Path Two) are independently shippable and submittable. If slice 5/6 slips,
Path Two's submission still stands on its own; Path One's submission is only blocked, not the
whole epic.

**Q: Is a real Anthropic API key / Sanity Context MCP access confirmed available in this
environment?**
A: Not yet confirmed — first action of slice 5's story is a real Portunus check, not an
assumption. If genuinely unavailable, this becomes an honestly-disclosed credential gap (same
pattern as epics 42/43/44/46), not a silent skip.

## 5. Decision points for user sign-off

1. Sequencing (Path Two slices 1-4 before Path One slices 5-6) — accept, or reprioritize?
2. `version_bump: none` inferred for this epic (feature work, no package release cadence
   established for demo-app-side epics this session) — confirm or override.
3. Copilot UI as the repo's first client-side admin component — accept the convention
   departure, or push for a non-streaming (form-POST, multi-step) alternative instead?

Proceeding with the stated defaults given explicit user direction to keep moving; flagged here
for the record rather than blocking on a fourth confirmation round.
