/**
 * scc-07: unit tests for lib/copilot-runtime.ts -- the glue between
 * scc-06's app-agnostic lib/copilot backend and this app's real
 * getServicesForDemo/env-var wiring. Same "mock lib/services.js's
 * getServicesForDemo wholesale, use real in-memory-backed CmsService/
 * ThemingService underneath" pattern as test/admin-mutation-guard.test.ts,
 * plus the same injected-fake-AnthropicClient seam as
 * test/copilot-loop.test.ts (no live Anthropic credential exists for this
 * project -- see lib/copilot/anthropic-client.ts's header comment) --
 * `runDemoCopilotTurn`'s own `overrides` param exists specifically so this
 * file doesn't need one either.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AdminAuthAdapter, AdminSession } from "@mercatus-liber/admin-auth";
import { createCmsService, createComponentRegistry, createInMemoryCmsAdapter, type CmsService } from "@mercatus-liber/cms";
import { createThemingService, type ThemingService } from "@mercatus-liber/theming";
import type { AnthropicClient, CopilotMessageParams } from "../lib/copilot/anthropic-client.js";
import { fakeMessage, fakeTextBlock, fakeToolUseBlock } from "./copilot-fixtures.js";

let currentSession: AdminSession | null = null;

let cms: CmsService;
let theming: ThemingService;

const mockAdminAuth: AdminAuthAdapter = {
  async getCurrentSession() {
    return currentSession;
  },
  async listAdminUsers() {
    return [];
  },
  async setAdminUserRole() {},
};

vi.mock("../lib/services.js", () => ({
  getServicesForDemo: vi.fn(async () => ({ cms, theming, adminAuth: mockAdminAuth })),
}));

const { isCopilotConfigured, runDemoCopilotTurn, applyCopilotOption } = await import("../lib/copilot-runtime.js");

function sessionFor(role: AdminSession["role"]): AdminSession {
  return { userId: `runtime-test-${role}`, email: `${role}@example.com`, role };
}

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

describe("lib/copilot-runtime.ts (scc-07)", () => {
  beforeEach(async () => {
    currentSession = null;
    cms = createCmsService({ persistence: createInMemoryCmsAdapter(), components: createComponentRegistry() });
    theming = createThemingService();
    await cms.createPage({
      pageType: "home",
      slug: "home",
      title: "Home",
      sections: [{ componentType: "hero-banner", config: { headline: "Welcome", subheadline: "Shop now" } }],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isCopilotConfigured", () => {
    it("is false when ANTHROPIC_API_KEY is unset -- the genuinely disclosed gap in this environment", () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      expect(isCopilotConfigured()).toBe(false);
    });

    it("is true once ANTHROPIC_API_KEY is set", () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-fake-for-testing-only");
      expect(isCopilotConfigured()).toBe(true);
    });
  });

  describe("runDemoCopilotTurn", () => {
    it("rejects an unknown demo slug", async () => {
      await expect(runDemoCopilotTurn({ demoSlug: "not-a-real-demo", requestText: "hi" })).rejects.toThrow(/unknown demo slug/i);
    });

    it("requires an authenticated admin session, even with an injected AnthropicClient override", async () => {
      currentSession = null;
      const anthropic = scriptedAnthropicClient([fakeMessage([fakeTextBlock("hi")], "end_turn")]);

      await expect(runDemoCopilotTurn({ demoSlug: "print-shop", requestText: "hello" }, { anthropic })).rejects.toThrow(
        /not authorized.*authenticated admin session/i,
      );
    });

    it("throws an honest 'not configured' error when no ANTHROPIC_API_KEY is set and no override is injected", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      currentSession = sessionFor("owner");

      await expect(runDemoCopilotTurn({ demoSlug: "print-shop", requestText: "hello" })).rejects.toThrow(/not configured/i);
    });

    it("runs the real tool-calling loop against real in-memory CmsService/ThemingService via an injected fake AnthropicClient", async () => {
      currentSession = sessionFor("owner");
      const candidates = [
        { id: "a", label: "Autumn warmth", headline: "Cozy autumn picks" },
        { id: "b", label: "Harvest", headline: "Harvest season deals" },
      ];
      const anthropic = scriptedAnthropicClient([
        fakeMessage([fakeToolUseBlock("propose_options", { shape: "swap_hero_copy", pageType: "home", slug: "home", candidates })], "tool_use"),
        fakeMessage([fakeTextBlock("Here are 2 seasonal hero options.")], "end_turn"),
      ]);

      const result = await runDemoCopilotTurn({ demoSlug: "print-shop", requestText: "make the hero seasonal" }, { anthropic });

      expect(result.finalText).toBe("Here are 2 seasonal hero options.");
      const proposeCall = result.toolCalls.find((c) => c.name === "propose_options");
      expect((proposeCall!.result as { candidates: unknown[] }).candidates).toHaveLength(2);
      // real CmsService underneath -- unchanged by a mere propose (no apply happened)
      expect((await cms.getPageBySlug("home"))?.sections[0]?.config.headline).toBe("Welcome");
    });
  });

  describe("applyCopilotOption", () => {
    it("rejects an unknown demo slug", async () => {
      await expect(
        applyCopilotOption({ demoSlug: "not-a-real-demo", shape: "swap_hero_copy", pageType: "home", slug: "home", chosen: { headline: "x" } }),
      ).rejects.toThrow(/unknown demo slug/i);
    });

    it("rejects a viewer-role session -- no mutation happens", async () => {
      currentSession = sessionFor("viewer");

      await expect(
        applyCopilotOption({
          demoSlug: "print-shop",
          shape: "swap_hero_copy",
          pageType: "home",
          slug: "home",
          chosen: { headline: "Should not land" },
        }),
      ).rejects.toThrow(/not authorized/i);

      expect((await cms.getPageBySlug("home"))?.sections[0]?.config.headline).toBe("Welcome");
    });

    it("rejects when there is no session at all", async () => {
      currentSession = null;

      await expect(
        applyCopilotOption({
          demoSlug: "print-shop",
          shape: "swap_hero_copy",
          pageType: "home",
          slug: "home",
          chosen: { headline: "Should not land" },
        }),
      ).rejects.toThrow(/not authorized/i);
    });

    it("genuinely writes through CmsService for an owner session, verifiable via a direct read (closes the loop into scc-04's dashboard data)", async () => {
      currentSession = sessionFor("owner");

      await applyCopilotOption({
        demoSlug: "print-shop",
        shape: "swap_hero_copy",
        pageType: "home",
        slug: "home",
        chosen: { headline: "Cozy autumn picks", subheadline: "Limited time" },
      });

      const page = await cms.getPageBySlug("home");
      expect(page?.sections[0]?.config).toEqual({ headline: "Cozy autumn picks", subheadline: "Limited time" });
    });

    it("genuinely writes through ThemingService for a swap_template shape", async () => {
      currentSession = sessionFor("admin");
      const [firstTemplate] = theming.listTemplates("category");
      expect(firstTemplate).toBeDefined();

      const result = await applyCopilotOption({
        demoSlug: "print-shop",
        shape: "swap_template",
        pageType: "category",
        slug: "category",
        chosen: { templateKey: firstTemplate!.key },
      });

      expect(result).toMatchObject({ templateKey: firstTemplate!.key });
      expect(theming.resolveTemplate("category")).toBe(firstTemplate!.key);
    });
  });
});
