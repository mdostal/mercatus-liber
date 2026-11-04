import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { computeGoalStatus, type Goal, type GoalsService } from "@mercatus-liber/community-goals";
import { isDemoSlug } from "../../../../../../lib/demos";
import { getOrCreateVoterId } from "../../../../../../lib/voter-cookie";
import { getServicesForDemo } from "../../../../../../lib/services";

/**
 * The public, unauthenticated half of the community-goals "toolset for
 * commerce stores to interact with the site" -- the admin CRUD page
 * (app/demo/[demoSlug]/admin/community-goals/page.tsx) manages goals;
 * THIS route is what a storefront's own client-side progress-bar/liquid-
 * fill component calls to read live status and cast a vote. Deliberately a
 * Route Handler, not a Server Action, for the same reason
 * app/api/demo/[demoSlug]/copilot/route.ts is one: a plain client-side
 * `fetch()` from an arbitrary storefront component (not necessarily
 * rendered inside this app's own Server Action tree) needs a stable JSON
 * HTTP endpoint, not an RSC-bound form action. Outside middleware.ts's
 * admin-only gate (`/demo/:demoSlug/admin(.*)`) -- intentionally public,
 * no auth check, matching "anyone can vote" being the entire point.
 */
type ResolvedGoal = { ok: true; goals: GoalsService; goal: Goal } | { ok: false; response: NextResponse };

async function resolveGoal(demoSlug: string, slug: string): Promise<ResolvedGoal> {
  if (!isDemoSlug(demoSlug)) return { ok: false, response: NextResponse.json({ error: `Unknown demo slug: ${demoSlug}` }, { status: 404 }) };
  const { goals } = await getServicesForDemo(demoSlug);
  const goal = await goals.getGoalBySlug(slug);
  if (!goal) return { ok: false, response: NextResponse.json({ error: `Unknown goal slug: ${slug}` }, { status: 404 }) };
  return { ok: true, goals, goal };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ demoSlug: string; slug: string }> }): Promise<NextResponse> {
  const { demoSlug, slug } = await params;
  const resolved = await resolveGoal(demoSlug, slug);
  if (!resolved.ok) return resolved.response;
  return NextResponse.json(computeGoalStatus(resolved.goal));
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ demoSlug: string; slug: string }> }): Promise<NextResponse> {
  const { demoSlug, slug } = await params;
  const resolved = await resolveGoal(demoSlug, slug);
  if (!resolved.ok) return resolved.response;
  const { goals, goal } = resolved;

  // demoSlug is already confirmed valid by resolveGoal above (isDemoSlug
  // narrows it), so this cast is safe -- mirrors cart-cookie.ts's own
  // DemoSlug-typed helpers.
  const voterId = await getOrCreateVoterId(demoSlug as Parameters<typeof getOrCreateVoterId>[0]);

  try {
    const result = await goals.castVote(goal.id, voterId);
    // castVote only returns null when goalId doesn't resolve -- goal.id
    // was just read from the same service, so this can't actually happen;
    // narrowed here only to satisfy the return type.
    if (!result) return NextResponse.json({ error: `Unknown goal: ${goal.id}` }, { status: 404 });
    return NextResponse.json({ ...computeGoalStatus(result.goal), alreadyVoted: result.alreadyVoted, crossedThreshold: result.crossedThreshold });
  } catch (err) {
    // Checked by `name`, not `instanceof GoalDisabledError` -- confirmed
    // live (see lib/services.ts's globalForServices doc comment for the
    // root cause) that Route Handlers and Server Actions/pages can land in
    // separate module bundles even in a `next start` production build, so
    // a class imported into both can fail `instanceof` across that
    // boundary despite being "the same" class at the source level. `name`
    // is a plain string on the thrown object, immune to that.
    if (err instanceof Error && err.name === "GoalDisabledError") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
