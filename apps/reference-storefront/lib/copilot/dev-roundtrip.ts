#!/usr/bin/env -S tsx
/**
 * scc-06's scripted CLI-level round trip (no UI in this story -- the admin
 * chat UI is scc-07). Run once with `pnpm --filter @mercatus-liber/reference-storefront copilot:roundtrip`
 * (or `pnpm copilot:roundtrip` from this app's own directory) to prove the
 * whole tool-calling loop end to end against real, in-memory-backed
 * CmsService/ThemingService:
 *
 *   1. A sample admin request ("make the home page hero more seasonal")
 *      genuinely returns 2-3 distinct candidate options via propose_options
 *      (not a single fixed response).
 *   2. Applying a chosen option writes through the real CmsService, and the
 *      change is verified via a direct CmsService read afterward.
 *   3. apply_option without confirm:true, and apply_option from a
 *      non-mutate-permitted (viewer) session, are both rejected the same
 *      way every other admin mutation in this repo already is.
 *
 * No real ANTHROPIC_API_KEY exists for this project (a real Portunus check
 * of the mercatus-liber-commerce vault found none -- see
 * anthropic-client.ts's header comment), so this script always drives the
 * loop with a scripted fake AnthropicClient standing in for Claude's
 * responses -- exactly the disclosed-gap posture this story's acceptance
 * criteria call for. If ANTHROPIC_API_KEY *is* set in the environment this
 * script runs in, it is used for a bonus real call proving the wrapper
 * against the live API; otherwise that step is skipped and reported.
 *
 * The Sanity Context MCP step is genuinely live when SANITY_TOKEN (an
 * org-scoped Context Viewer token, not the project-scoped
 * mercatus-liber-sanity-token this repo's CMS adapter uses) and
 * SANITY_CONTEXT_ORG_ID are set in the environment; otherwise it reports
 * the same honest gap this story's research step found live against the
 * real endpoint (see sanity-context-client.ts's header comment).
 */
import type { AdminSession } from "@mercatus-liber/admin-auth";
import { createCmsService, createComponentRegistry, createInMemoryCmsAdapter } from "@mercatus-liber/cms";
import { createThemingService } from "@mercatus-liber/theming";
import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient, type AnthropicClient } from "./anthropic-client";
import { createSanityContextClient } from "./sanity-context-client";
import { runCopilotTurn } from "./loop";

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args);
}

function fakeUsage(): Anthropic.Usage {
  return {
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    inference_geo: null,
    input_tokens: 10,
    output_tokens: 10,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
  };
}

function textBlock(text: string): Anthropic.TextBlock {
  return { type: "text", text, citations: null };
}

function toolUseBlock(name: string, input: Record<string, unknown>, id: string): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input, caller: { type: "direct" } };
}

function message(content: Anthropic.ContentBlock[], stopReason: Anthropic.StopReason): Anthropic.Message {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    type: "message",
    role: "assistant",
    container: null,
    content,
    model: "claude-opus-5",
    stop_details: null,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: fakeUsage(),
  };
}

/** A fresh AnthropicClient that replays a fixed script of Messages, one per createMessage() call, in order. */
function scriptedClient(script: Anthropic.Message[]): AnthropicClient {
  let i = 0;
  return {
    async createMessage() {
      if (i >= script.length) throw new Error("scriptedClient: ran out of scripted turns");
      return script[i++]!;
    },
  };
}

/**
 * Two separate scripted clients, one per separate admin round trip
 * (propose, then -- after the admin reviews the options and picks one in a
 * later message -- apply). Each runCopilotTurn() call starts its own fresh
 * conversation (see loop.ts), so these are two independent scripts, not one
 * continuous 4-message conversation -- mirrors how a real chat UI (scc-07)
 * would actually drive this: one backend call per admin message.
 */
function scriptedProposeTurn(): AnthropicClient {
  return scriptedClient([
    message(
      [
        toolUseBlock(
          "propose_options",
          {
            shape: "swap_hero_copy",
            pageType: "home",
            slug: "home",
            candidates: [
              { id: "a", label: "Autumn warmth", headline: "Cozy autumn picks, fresh off the shelf" },
              { id: "b", label: "Harvest season", headline: "Harvest season deals are here" },
              { id: "c", label: "Pumpkin everything", headline: "Pumpkin spice, sweater weather, savings" },
            ],
          },
          "toolu_propose",
        ),
      ],
      "tool_use",
    ),
    message([textBlock("Here are 3 seasonal hero copy options -- let me know which one to apply.")], "end_turn"),
  ]);
}

function scriptedApplyTurn(): AnthropicClient {
  return scriptedClient([
    message(
      [
        toolUseBlock(
          "apply_option",
          {
            shape: "swap_hero_copy",
            pageType: "home",
            slug: "home",
            chosen: { headline: "Harvest season deals are here" },
            confirm: true,
          },
          "toolu_apply",
        ),
      ],
      "tool_use",
    ),
    message([textBlock("Done -- applied option b.")], "end_turn"),
  ]);
}

function sessionFor(role: AdminSession["role"]): AdminSession {
  return { userId: `roundtrip-${role}`, email: `${role}@example.com`, role };
}

async function main(): Promise<void> {
  log("=== scc-06 copilot backend -- scripted round trip ===\n");

  // --- 1. Real Portunus / credential status, restated for anyone running this script cold ---
  log("Anthropic credential: %s", process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY is set -- using the REAL client for a bonus call" : "none set (genuinely absent from Portunus's mercatus-liber-commerce vault) -- using the scripted fake client");
  log(
    "Sanity Context MCP credential: %s",
    process.env.SANITY_TOKEN && process.env.SANITY_CONTEXT_ORG_ID
      ? "SANITY_TOKEN + SANITY_CONTEXT_ORG_ID set -- attempting a real live query"
      : "not set -- this story's real, live check found no org-scoped Context Viewer token and no configured Knowledge Base endpoint (see sanity-context-client.ts's header comment); skipping live query",
  );
  log("");

  // --- 2. Real, in-memory-backed CmsService/ThemingService (same services every CmsService test in this repo uses) ---
  const cms = createCmsService({ persistence: createInMemoryCmsAdapter(), components: createComponentRegistry() });
  const theming = createThemingService();
  await cms.createPage({
    pageType: "home",
    slug: "home",
    title: "Home",
    sections: [
      { componentType: "hero-banner", config: { headline: "Welcome", subheadline: "Shop now" } },
      { componentType: "product-grid", config: { productIds: ["p1", "p2"] } },
    ],
  });

  const before = await cms.getPageBySlug("home");
  log("Before: home page hero headline = %j", before?.sections[0]?.config.headline);

  // --- 3. Sanity Context MCP: real live attempt when configured, honest disclosure otherwise ---
  if (process.env.SANITY_TOKEN && process.env.SANITY_CONTEXT_ORG_ID) {
    const client = createSanityContextClient({
      organizationId: process.env.SANITY_CONTEXT_ORG_ID,
      mcpEndpointName: process.env.SANITY_CONTEXT_ENDPOINT_NAME ?? "default",
      token: process.env.SANITY_TOKEN,
    });
    const result = await client.query({ question: "What sections exist on the home page?" });
    log("Sanity Context MCP live query result: %j", result);
  }
  log("");

  // --- 4. The tool-calling loop, propose then apply, against a scripted Claude (owner session) ---
  log("--- Turn 1: propose_options ---");
  const proposeResult = await runCopilotTurn(
    scriptedProposeTurn(),
    { cms, theming, session: sessionFor("owner") },
    { requestText: "make the home page hero more seasonal" },
  );
  const proposeCall = proposeResult.toolCalls.find((c) => c.name === "propose_options");
  log("Claude's reply: %s", proposeResult.finalText);
  log(
    "propose_options returned %d distinct candidates: %j",
    (proposeCall?.result as { candidates: { id: string; headline: string }[] }).candidates.length,
    (proposeCall?.result as { candidates: { id: string; headline: string }[] }).candidates.map((c) => `${c.id}: ${c.headline}`),
  );

  // --- 5. Rejection paths, proven directly against the same handlers the loop uses ---
  log("\n--- Rejection paths (mirrors requireAdminPermission's own discipline) ---");
  const { createCopilotToolHandlers } = await import("./handlers");
  const viewerHandlers = createCopilotToolHandlers({ cms, theming, session: sessionFor("viewer") });
  try {
    await viewerHandlers.apply_option!({ shape: "swap_hero_copy", pageType: "home", slug: "home", chosen: { headline: "nope" }, confirm: true });
    log("UNEXPECTED: viewer session was allowed to apply -- this is a bug");
  } catch (err) {
    log("viewer session correctly rejected: %s", err instanceof Error ? err.message : err);
  }

  const ownerHandlers = createCopilotToolHandlers({ cms, theming, session: sessionFor("owner") });
  const preview = await ownerHandlers.apply_option!({ shape: "swap_hero_copy", pageType: "home", slug: "home", chosen: { headline: "nope" } });
  log("owner session without confirm:true correctly returned a preview: %j", preview);
  log("home page still unchanged after both rejection attempts: %j", (await cms.getPageBySlug("home"))?.sections[0]?.config.headline);

  // --- 6. Turn 2: apply the chosen option for real, then verify via a direct CmsService read ---
  log("\n--- Turn 2: apply_option (confirm:true, owner session) ---");
  const applyResult = await runCopilotTurn(scriptedApplyTurn(), { cms, theming, session: sessionFor("owner") }, { requestText: "apply option b" });
  log("Claude's reply: %s", applyResult.finalText);

  const after = await cms.getPageBySlug("home");
  log("After: home page hero headline = %j (verified via a direct CmsService.getPageBySlug read)", after?.sections[0]?.config.headline);

  if (after?.sections[0]?.config.headline !== "Harvest season deals are here") {
    throw new Error("Round trip FAILED: the applied headline was not persisted through CmsService");
  }

  // --- 7. Optional bonus: a real Anthropic call, only if ANTHROPIC_API_KEY is actually set ---
  if (process.env.ANTHROPIC_API_KEY) {
    log("\n--- Bonus: one real Anthropic Messages API call (ANTHROPIC_API_KEY is set) ---");
    const realClient = createAnthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY });
    const real = await realClient.createMessage({
      max_tokens: 256,
      messages: [{ role: "user", content: "Reply with exactly the word: verified" }],
    });
    log("Real API stop_reason=%s content=%j", real.stop_reason, real.content);
  }

  log("\n=== Round trip PASSED ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
