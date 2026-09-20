import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDemoSlug } from "../../../../../lib/demos";
import { isCopilotConfigured, runDemoCopilotTurn } from "../../../../../lib/copilot-runtime";

/**
 * scc-07: this app's first route handler (confirmed by researching this
 * story: no app/api/** existed anywhere in reference-storefront before this
 * file -- every other admin surface is a plain server-rendered page with
 * "use server" form actions, see lib/actions.ts). A route handler is the
 * right tool here specifically because one admin chat turn drives an
 * LLM tool-calling loop (lib/copilot/loop.ts) that can take several seconds
 * and multiple round trips -- a `<form action={...}>` Server Action bundles
 * its return value into the same RSC re-render response and can't express
 * "POST this JSON body, get this JSON body back" for a client-driven chat
 * transcript the way a plain fetch() can (see
 * app/demo/[demoSlug]/admin/copilot/CopilotChat.tsx's own header comment
 * for the client-component side of this same justification). The
 * deterministic "apply this exact chosen candidate" mutation is
 * deliberately NOT here -- see lib/copilot-actions.ts's
 * applyCopilotOptionAction, a plain Server Action, because that one IS a
 * single deterministic RPC with no streaming/long-running-LLM-call need.
 *
 * middleware.ts's clerkAdminGate only protects `/demo/:demoSlug/admin(.*)`
 * (see that file's own isAdminRoute matcher) -- this route lives under
 * /api, outside that pattern, so it does its own authentication check
 * below (runDemoCopilotTurn throws when there is no admin session at all)
 * rather than relying on the admin page's render-time gate, per this app's
 * own "render-time gating is not a security boundary" Server Actions
 * guidance (node_modules/next/dist/docs/01-app/02-guides/server-actions.md).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ demoSlug: string }> },
): Promise<NextResponse> {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) {
    return NextResponse.json({ error: `Unknown demo slug: ${demoSlug}` }, { status: 404 });
  }

  if (!isCopilotConfigured()) {
    return NextResponse.json(
      {
        error:
          "AI copilot is not configured for this environment -- set ANTHROPIC_API_KEY (and optionally SANITY_CONTEXT_MCP_TOKEN) to enable it.",
      },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const requestText = typeof body?.requestText === "string" ? body.requestText.trim() : "";
  if (!requestText) {
    return NextResponse.json({ error: "requestText is required" }, { status: 400 });
  }
  const maxIterations = typeof body?.maxIterations === "number" ? body.maxIterations : undefined;

  try {
    const result = await runDemoCopilotTurn({ demoSlug, requestText, maxIterations });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The only thing runDemoCopilotTurn itself throws (beyond an unknown
    // demoSlug, already handled above) is "no admin session" -- see its own
    // doc comment. A bad/rejected tool call (e.g. apply_option without
    // permission) is never thrown -- loop.ts always captures it as a
    // tool_result with is_error:true inside a normal 200 response instead
    // (see loop.ts's own header comment), so this catch block is genuinely
    // the auth-failure path, not a generic error handler.
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
