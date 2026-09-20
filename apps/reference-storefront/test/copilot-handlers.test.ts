/**
 * scc-06: unit tests for the copilot's own tool handlers
 * (lib/copilot/handlers.ts), called directly rather than through the
 * Anthropic tool-calling loop -- this is the most direct way to assert
 * apply_option's confirm:true/permission-rejection paths per this story's
 * acceptance criteria ("Given apply_option is called without confirm:true
 * or by a non-mutate-permitted session, when checked, then it's rejected
 * the same way every other admin mutation in this repo already is"). Every
 * CmsService/ThemingService here is real and in-memory-backed (same
 * "mocked adminAuth/session only" shape as
 * test/admin-mutation-guard.test.ts), so a "succeeds normally" assertion
 * proves a genuine mutation happened, not just that no error was thrown.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { AdminRole, AdminSession } from "@mercatus-liber/admin-auth";
import { createCmsService, createComponentRegistry, createInMemoryCmsAdapter, type CmsService } from "@mercatus-liber/cms";
import { createThemingService, type ThemingService } from "@mercatus-liber/theming";
import { createCopilotToolHandlers } from "../lib/copilot/handlers.js";
import type { SanityContextClient } from "../lib/copilot/sanity-context-client.js";

function sessionFor(role: AdminRole): AdminSession {
  return { userId: `test-${role}`, email: `${role}@example.com`, role };
}

describe("copilot tool handlers (scc-06)", () => {
  let cms: CmsService;
  let theming: ThemingService;

  beforeEach(async () => {
    cms = createCmsService({ persistence: createInMemoryCmsAdapter(), components: createComponentRegistry() });
    theming = createThemingService();
    await cms.createPage({
      pageType: "home",
      slug: "home",
      title: "Home",
      sections: [
        { componentType: "hero-banner", config: { headline: "Welcome", subheadline: "Shop now" } },
        { componentType: "product-grid", config: { productIds: ["p1", "p2"] } },
      ],
    });
  });

  describe("get_current_sections", () => {
    it("returns a found page's sections", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: null });
      const result = (await handlers.get_current_sections!({ pageType: "home", slug: "home" })) as { found: boolean; sections: unknown[] };
      expect(result.found).toBe(true);
      expect(result.sections).toHaveLength(2);
    });

    it("reports found:false for a missing slug", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: null });
      const result = (await handlers.get_current_sections!({ pageType: "home", slug: "no-such-page" })) as { found: boolean };
      expect(result.found).toBe(false);
    });
  });

  describe("get_current_template", () => {
    it("returns the current default plus every registered template for the page type", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: null });
      const result = (await handlers.get_current_template!({ pageType: "home" })) as { current: string; available: { key: string }[] };
      expect(result.current).toBe("home.standard-grid");
      expect(result.available.map((t) => t.key)).toContain("home.magazine-grid");
    });
  });

  describe("search_sanity_context", () => {
    it("honestly reports unavailable when no client is configured -- the disclosed gap this story found", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: null });
      const result = await handlers.search_sanity_context!({ question: "what sections exist on the home page?" });
      expect(result).toEqual({
        available: false,
        reason: "No Sanity Context MCP client configured for this deployment.",
      });
    });

    it("delegates to an injected SanityContextClient when one is configured", async () => {
      const fakeClient: SanityContextClient = {
        async query({ question }) {
          return { available: true, results: [{ title: "hit", snippet: `matched: ${question}` }] };
        },
      };
      const handlers = createCopilotToolHandlers({ cms, theming, session: null, sanityContext: fakeClient });
      const result = await handlers.search_sanity_context!({ question: "seasonal hero copy" });
      expect(result).toEqual({ available: true, results: [{ title: "hit", snippet: "matched: seasonal hero copy" }] });
    });
  });

  describe("propose_options", () => {
    it("accepts 2-3 swap_hero_copy candidates and echoes them back unmutated", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: null });
      const candidates = [
        { id: "a", label: "Autumn", headline: "Cozy autumn picks" },
        { id: "b", label: "Harvest", headline: "Harvest season deals" },
      ];
      const result = await handlers.propose_options!({ shape: "swap_hero_copy", pageType: "home", slug: "home", candidates });
      expect(result).toEqual({ shape: "swap_hero_copy", pageType: "home", slug: "home", candidates });
      // read-only -- the page is untouched
      expect((await cms.getPageBySlug("home"))?.sections[0]?.config.headline).toBe("Welcome");
    });

    it("rejects a candidate count outside 2-3", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: null });
      await expect(
        handlers.propose_options!({
          shape: "swap_hero_copy",
          pageType: "home",
          slug: "home",
          candidates: [{ id: "a", label: "Only one", headline: "x" }],
        }),
      ).rejects.toThrow(/2 or 3/);
    });

    it("rejects a shape outside the fixed set", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: null });
      await expect(
        handlers.propose_options!({
          shape: "rewrite_entire_page",
          pageType: "home",
          slug: "home",
          candidates: [
            { id: "a", label: "x", headline: "x" },
            { id: "b", label: "y", headline: "y" },
          ],
        }),
      ).rejects.toThrow(/unsupported shape/);
    });

    it("rejects a swap_template candidate whose templateKey isn't registered for the page type", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: null });
      await expect(
        handlers.propose_options!({
          shape: "swap_template",
          pageType: "home",
          slug: "home",
          candidates: [
            { id: "a", label: "x", templateKey: "home.standard-grid" },
            { id: "b", label: "y", templateKey: "no-such-template" },
          ],
        }),
      ).rejects.toThrow(/not registered/);
    });

    it("accepts valid swap_template candidates", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: null });
      const result = await handlers.propose_options!({
        shape: "swap_template",
        pageType: "home",
        slug: "home",
        candidates: [
          { id: "a", label: "Magazine", templateKey: "home.magazine-grid" },
          { id: "b", label: "Spec grid", templateKey: "home.spec-grid" },
        ],
      });
      expect((result as { candidates: unknown[] }).candidates).toHaveLength(2);
    });
  });

  describe("apply_option -- confirm:true / permission gate (mirrors requireAdminPermission)", () => {
    it("rejects a viewer-role session even with confirm:true", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: sessionFor("viewer") });
      await expect(
        handlers.apply_option!({
          shape: "swap_hero_copy",
          pageType: "home",
          slug: "home",
          chosen: { headline: "Should never land" },
          confirm: true,
        }),
      ).rejects.toThrow(/not authorized/i);

      expect((await cms.getPageBySlug("home"))?.sections[0]?.config.headline).toBe("Welcome");
    });

    it("rejects when there is no session at all", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: null });
      await expect(
        handlers.apply_option!({
          shape: "swap_hero_copy",
          pageType: "home",
          slug: "home",
          chosen: { headline: "Should never land" },
          confirm: true,
        }),
      ).rejects.toThrow(/not authorized/i);
    });

    it("returns a preview (not a mutation) for a permitted session that omits confirm:true", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: sessionFor("admin") });
      const result = await handlers.apply_option!({
        shape: "swap_hero_copy",
        pageType: "home",
        slug: "home",
        chosen: { headline: "Preview only" },
      });
      expect(result).toMatchObject({ requiresConfirmation: true });
      expect((await cms.getPageBySlug("home"))?.sections[0]?.config.headline).toBe("Welcome");
    });

    it("returns a preview when confirm is explicitly false", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: sessionFor("owner") });
      const result = await handlers.apply_option!({
        shape: "swap_hero_copy",
        pageType: "home",
        slug: "home",
        chosen: { headline: "Preview only" },
        confirm: false,
      });
      expect(result).toMatchObject({ requiresConfirmation: true });
    });

    it("applies swap_hero_copy for an admin session with confirm:true, verifiable via a direct CmsService read", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: sessionFor("admin") });
      await handlers.apply_option!({
        shape: "swap_hero_copy",
        pageType: "home",
        slug: "home",
        chosen: { headline: "Cozy autumn picks", subheadline: "Limited time" },
        confirm: true,
      });

      const page = await cms.getPageBySlug("home");
      expect(page?.sections[0]).toEqual({
        componentType: "hero-banner",
        config: { headline: "Cozy autumn picks", subheadline: "Limited time" },
      });
      // the sibling section is untouched
      expect(page?.sections[1]?.componentType).toBe("product-grid");
    });

    it("applies swap_template for an owner session with confirm:true, verifiable via a direct ThemingService read", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: sessionFor("owner") });
      expect(theming.resolveTemplate("home")).toBe("home.standard-grid");

      await handlers.apply_option!({
        shape: "swap_template",
        pageType: "home",
        slug: "home",
        chosen: { templateKey: "home.magazine-grid" },
        confirm: true,
      });

      expect(theming.resolveTemplate("home")).toBe("home.magazine-grid");
    });

    it("throws for a swap_hero_copy target page with no hero-banner section", async () => {
      await cms.createPage({ pageType: "category", slug: "no-hero", title: "No Hero", sections: [{ componentType: "product-grid", config: {} }] });
      const handlers = createCopilotToolHandlers({ cms, theming, session: sessionFor("owner") });
      await expect(
        handlers.apply_option!({
          shape: "swap_hero_copy",
          pageType: "category",
          slug: "no-hero",
          chosen: { headline: "x" },
          confirm: true,
        }),
      ).rejects.toThrow(/no hero-banner section/);
    });

    it("throws for an unregistered templateKey even with full permission and confirm:true", async () => {
      const handlers = createCopilotToolHandlers({ cms, theming, session: sessionFor("owner") });
      await expect(
        handlers.apply_option!({
          shape: "swap_template",
          pageType: "home",
          slug: "home",
          chosen: { templateKey: "no-such-template" },
          confirm: true,
        }),
      ).rejects.toThrow(/not registered/);
      expect(theming.resolveTemplate("home")).toBe("home.standard-grid");
    });
  });
});
