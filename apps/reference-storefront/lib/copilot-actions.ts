"use server";

import { revalidatePath } from "next/cache";
import type { ProposalShape, ToolResult } from "./copilot/index.js";
import { isDemoSlug } from "./demos";
import { applyCopilotOption } from "./copilot-runtime";

/**
 * scc-07: the "admin clicked Apply on this candidate card" mutation -- a
 * Server Action (not a route handler) because it's a deterministic,
 * single-shot RPC exactly like every other admin mutation in lib/actions.ts,
 * invoked directly from app/demo/[demoSlug]/admin/copilot/CopilotChat.tsx's
 * client-side event handler (Next's documented "invoke from an event
 * handler wrapped in startTransition" Server Action shape -- see that
 * file's own comment) rather than a <form action> submit, since it needs to
 * run in response to a button inside an already-rendered chat transcript,
 * not a full-page form post. Permission is enforced by lib/copilot's own
 * requireMutatePermission (called inside applyCopilotOption ->
 * handlers.ts's apply_option) -- the exact same "mutate" gate every other
 * admin mutation action in this file's sibling lib/actions.ts calls via
 * requireAdminPermission, just reached through lib/copilot's own call site
 * per permission.ts's header comment (it deliberately does not import
 * lib/actions.ts's private requireAdminPermission).
 */
export interface ApplyCopilotOptionActionInput {
  demoSlug: string;
  shape: ProposalShape;
  pageType: string;
  slug: string;
  chosen: Record<string, unknown>;
}

export async function applyCopilotOptionAction(input: ApplyCopilotOptionActionInput): Promise<ToolResult> {
  if (!isDemoSlug(input.demoSlug)) {
    throw new Error(`applyCopilotOptionAction: unknown demo slug ${JSON.stringify(input.demoSlug)}`);
  }

  const result = await applyCopilotOption({
    demoSlug: input.demoSlug,
    shape: input.shape,
    pageType: input.pageType,
    slug: input.slug,
    chosen: input.chosen,
  });

  // Closes the loop into scc-04's Content & Layout dashboard: a real
  // ThemingService.setDefaultTemplate or CmsService.updatePage write just
  // happened above, so that dashboard's next load must reflect it rather
  // than a stale cached render.
  revalidatePath(`/demo/${input.demoSlug}/admin/content-layout`);

  return result;
}
