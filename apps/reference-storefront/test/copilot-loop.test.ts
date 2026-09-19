/**
 * scc-06: unit tests for the tool-calling loop (lib/copilot/loop.ts)
 * against an injected, scripted fake AnthropicClient -- the same
 * disclosed-double pattern as adapter-shopify's fake-shopify-store.ts (no
 * live Anthropic credential exists for this project in Portunus; see
 * lib/copilot/anthropic-client.ts's header comment). Every CmsService/
 * ThemingService here is real and in-memory-backed, so assertions below
 * prove genuine mutations (or genuine non-mutations), not just that no
 * error was thrown.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AdminSession } from "@mercatus-liber/admin-auth";
import { createCmsService, createComponentRegistry, createInMemoryCmsAdapter, type CmsService } from "@mercatus-liber/cms";
import { createThemingService, type ThemingService } from "@mercatus-liber/theming";
import type { AnthropicClient, CopilotMessageParams } from "../lib/copilot/anthropic-client.js";
import { runCopilotTurn } from "../lib/copilot/loop.js";
import { fakeMessage, fakeTextBlock, fakeToolUseBlock } from "./copilot-fixtures.js";

/** A scripted fake AnthropicClient: returns one canned Message per call, in order. Throws if the script runs out. */
function scriptedAnthropicClient(script: Anthropic.Message[]): AnthropicClient & { calls: CopilotMessageParams[] } {
  const calls: CopilotMessageParams[] = [];
  let i = 0;
  return {
    calls,
    async createMessage(params) {
      calls.push(params);
      if (i >= script.length) throw new Error("scriptedAnthropicClient: ran out of scripted responses");
      return script[i++]!;
    },
  };
}

function sessionFor(role: AdminSession["role"]): AdminSession {
  return { userId: `test-${role}`, email: `${role}@example.com`, role };
}

describe("runCopilotTurn (scc-06)", () => {
  let cms: CmsService;
  let theming: ThemingService;

  beforeEach(async () => {
    cms = createCmsService({ persistence: createInMemoryCmsAdapter(), components: createComponentRegistry() });
    theming = createThemingService();
    await cms.createPage({
      pageType: "home",
      slug: "home",
      title: "Home",
      sections: [{ componentType: "hero-banner", config: { headline: "Welcome", subheadline: "Shop now" } }],
    });
  });

  it("returns the final text when Claude answers with no tool calls at all", async () => {
    const client = scriptedAnthropicClient([fakeMessage([fakeTextBlock("Hi, how can I help with this page?")], "end_turn")]);

    const result = await runCopilotTurn(client, { cms, theming, session: null }, { requestText: "hello" });

    expect(result.finalText).toBe("Hi, how can I help with this page?");
    expect(result.toolCalls).toHaveLength(0);
    expect(result.stopReason).toBe("end_turn");
  });

  it("executes a real read tool call against the in-memory CmsService and feeds the result back", async () => {
    const client = scriptedAnthropicClient([
      fakeMessage([fakeToolUseBlock("get_current_sections", { pageType: "home", slug: "home" })], "tool_use"),
      fakeMessage([fakeTextBlock("The home page currently has one hero-banner section.")], "end_turn"),
    ]);

    const result = await runCopilotTurn(client, { cms, theming, session: null }, { requestText: "what's on the home page?" });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("get_current_sections");
    expect(result.toolCalls[0]!.isError).toBeUndefined();
    expect(result.toolCalls[0]!.result).toMatchObject({ found: true });
    expect(result.finalText).toBe("The home page currently has one hero-banner section.");

    // the second request Claude "sent" carries the tool_result back
    expect(client.calls[1]!.messages.at(-1)).toMatchObject({ role: "user" });
  });

  it("genuinely returns 2-3 distinct candidate options from propose_options, not a single fixed response", async () => {
    const candidates = [
      { id: "a", label: "Autumn warmth", headline: "Cozy autumn picks" },
      { id: "b", label: "Harvest", headline: "Harvest season deals" },
      { id: "c", label: "Pumpkin spice", headline: "Pumpkin spice everything" },
    ];
    const client = scriptedAnthropicClient([
      fakeMessage([fakeToolUseBlock("propose_options", { shape: "swap_hero_copy", pageType: "home", slug: "home", candidates })], "tool_use"),
      fakeMessage([fakeTextBlock("Here are 3 seasonal hero options.")], "end_turn"),
    ]);

    const result = await runCopilotTurn(client, { cms, theming, session: null }, { requestText: "make the hero more seasonal" });

    const proposeCall = result.toolCalls.find((c) => c.name === "propose_options");
    const options = (proposeCall!.result as { candidates: unknown[] }).candidates;
    expect(options).toHaveLength(3);
    expect(new Set(options.map((o) => (o as { id: string }).id)).size).toBe(3); // genuinely distinct, not a single repeated shape
  });

  it("apply_option without confirm:true returns a preview through the loop -- no mutation happens", async () => {
    const client = scriptedAnthropicClient([
      fakeMessage(
        [fakeToolUseBlock("apply_option", { shape: "swap_hero_copy", pageType: "home", slug: "home", chosen: { headline: "Should not land" } })],
        "tool_use",
      ),
      fakeMessage([fakeTextBlock("Here's a preview -- confirm to apply.")], "end_turn"),
    ]);

    const result = await runCopilotTurn(client, { cms, theming, session: sessionFor("owner") }, { requestText: "apply option a" });

    expect(result.toolCalls[0]!.isError).toBeUndefined();
    expect(result.toolCalls[0]!.result).toMatchObject({ requiresConfirmation: true });
    expect((await cms.getPageBySlug("home"))?.sections[0]?.config.headline).toBe("Welcome");
  });

  it("apply_option with confirm:true but a non-mutate-permitted (viewer) session is rejected inside the loop -- no mutation happens", async () => {
    const client = scriptedAnthropicClient([
      fakeMessage(
        [
          fakeToolUseBlock("apply_option", {
            shape: "swap_hero_copy",
            pageType: "home",
            slug: "home",
            chosen: { headline: "Should not land" },
            confirm: true,
          }),
        ],
        "tool_use",
      ),
      fakeMessage([fakeTextBlock("Sorry, you don't have permission to apply that.")], "end_turn"),
    ]);

    const result = await runCopilotTurn(client, { cms, theming, session: sessionFor("viewer") }, { requestText: "apply option a" });

    expect(result.toolCalls[0]!.isError).toBe(true);
    expect((result.toolCalls[0]!.result as { error: string }).error).toMatch(/not authorized/i);
    expect((await cms.getPageBySlug("home"))?.sections[0]?.config.headline).toBe("Welcome");
  });

  it("apply_option with confirm:true and an owner session genuinely writes through CmsService, verifiable via a direct read", async () => {
    const client = scriptedAnthropicClient([
      fakeMessage(
        [
          fakeToolUseBlock("apply_option", {
            shape: "swap_hero_copy",
            pageType: "home",
            slug: "home",
            chosen: { headline: "Cozy autumn picks", subheadline: "Limited time" },
            confirm: true,
          }),
        ],
        "tool_use",
      ),
      fakeMessage([fakeTextBlock("Done -- the hero copy is updated.")], "end_turn"),
    ]);

    const result = await runCopilotTurn(client, { cms, theming, session: sessionFor("owner") }, { requestText: "apply option a" });

    expect(result.toolCalls[0]!.isError).toBeUndefined();
    const page = await cms.getPageBySlug("home");
    expect(page?.sections[0]?.config).toEqual({ headline: "Cozy autumn picks", subheadline: "Limited time" });
  });

  it("marks an unknown tool name as an error result without crashing the loop", async () => {
    const client = scriptedAnthropicClient([
      fakeMessage([fakeToolUseBlock("delete_everything", {})], "tool_use"),
      fakeMessage([fakeTextBlock("I can't do that.")], "end_turn"),
    ]);

    const result = await runCopilotTurn(client, { cms, theming, session: sessionFor("owner") }, { requestText: "delete everything" });

    expect(result.toolCalls[0]!.isError).toBe(true);
    expect((result.toolCalls[0]!.result as { error: string }).error).toMatch(/unknown tool/i);
    expect(result.finalText).toBe("I can't do that.");
  });

  it("stops after maxIterations even if Claude keeps calling tools, rather than looping forever", async () => {
    const infiniteToolCalls = Array.from({ length: 5 }, () =>
      fakeMessage([fakeToolUseBlock("get_current_template", { pageType: "home" })], "tool_use"),
    );
    const client = scriptedAnthropicClient(infiniteToolCalls);

    const result = await runCopilotTurn(client, { cms, theming, session: null }, { requestText: "loop forever", maxIterations: 5 });
    expect(result.toolCalls).toHaveLength(5);
    expect(result.stopReason).toBe("tool_use");
  });
});
