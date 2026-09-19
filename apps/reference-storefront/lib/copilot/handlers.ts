import { needsConfirmation, pendingConfirmation } from "@mercatus-liber/ai-interface";
import type { ComponentInstance } from "@mercatus-liber/cms";
import { requireMutatePermission } from "./permission.js";
import type { CopilotToolDeps, HeroCopyCandidate, ProposalShape, TemplateSwapCandidate, ToolResult } from "./types.js";

export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

const PROPOSAL_SHAPES: ProposalShape[] = ["swap_hero_copy", "swap_template"];

function isHeroCandidate(c: unknown): c is HeroCopyCandidate {
  const r = c as Record<string, unknown>;
  return typeof r?.id === "string" && typeof r?.label === "string" && typeof r?.headline === "string";
}

function isTemplateCandidate(c: unknown): c is TemplateSwapCandidate {
  const r = c as Record<string, unknown>;
  return typeof r?.id === "string" && typeof r?.label === "string" && typeof r?.templateKey === "string";
}

/**
 * Every handler below is a thin delegation to CmsService/ThemingService (or,
 * for search_sanity_context, the injected SanityContextClient) -- same
 * zero-duplicated-business-logic discipline as
 * @mercatus-liber/ai-interface's createCommerceToolHandlers
 * (packages/ai-interface/src/handlers.ts).
 */
export function createCopilotToolHandlers(deps: CopilotToolDeps): Record<string, ToolHandler> {
  const { cms, theming, session, sanityContext } = deps;

  async function findHeroSection(slug: string): Promise<{ pageId: string; sections: ComponentInstance[]; index: number } | null> {
    const page = await cms.getPageBySlug(slug);
    if (!page) return null;
    const index = page.sections.findIndex((s) => s.componentType === "hero-banner");
    if (index === -1) return null;
    return { pageId: page.id, sections: page.sections, index };
  }

  return {
    async get_current_sections(input) {
      const slug = input.slug as string;
      const page = await cms.getPageBySlug(slug);
      if (!page) return { found: false, slug };
      return { found: true, pageId: page.id, title: page.title, status: page.status, sections: page.sections };
    },

    async get_current_template(input) {
      const pageType = input.pageType as string;
      return {
        pageType,
        current: theming.resolveTemplate(pageType),
        available: theming.listTemplates(pageType),
      };
    },

    async search_sanity_context(input) {
      const question = input.question as string;
      if (!sanityContext) {
        return { available: false, reason: "No Sanity Context MCP client configured for this deployment." };
      }
      return sanityContext.query({ question });
    },

    async propose_options(input) {
      const shape = input.shape as ProposalShape;
      const pageType = input.pageType as string;
      const slug = input.slug as string;
      const candidates = input.candidates as unknown[];

      if (!PROPOSAL_SHAPES.includes(shape)) {
        throw new Error(`propose_options: unsupported shape "${shape}" -- must be one of ${PROPOSAL_SHAPES.join(", ")}`);
      }
      if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 3) {
        throw new Error("propose_options: candidates must be an array of 2 or 3 items");
      }

      if (shape === "swap_hero_copy") {
        if (!candidates.every(isHeroCandidate)) {
          throw new Error("propose_options: every swap_hero_copy candidate needs id, label, and headline");
        }
      } else {
        if (!candidates.every(isTemplateCandidate)) {
          throw new Error("propose_options: every swap_template candidate needs id, label, and templateKey");
        }
        const available = new Set(theming.listTemplates(pageType).map((t) => t.key));
        for (const c of candidates as TemplateSwapCandidate[]) {
          if (!available.has(c.templateKey)) {
            throw new Error(`propose_options: templateKey "${c.templateKey}" is not registered for page type "${pageType}"`);
          }
        }
      }

      return { shape, pageType, slug, candidates };
    },

    async apply_option(input) {
      // Same order every other admin mutation in this repo uses: permission
      // is checked unconditionally first, THEN the confirm:true preview gate
      // -- see permission.ts's header comment and design-discussion.md #2e.
      requireMutatePermission(session);
      if (needsConfirmation(input)) return pendingConfirmation({ action: "apply_option", ...input });

      const shape = input.shape as ProposalShape;
      const pageType = input.pageType as string;
      const slug = input.slug as string;
      const chosen = input.chosen as Record<string, unknown>;

      if (shape === "swap_hero_copy") {
        const headline = chosen.headline as string;
        const subheadline = chosen.subheadline as string | undefined;
        const found = await findHeroSection(slug);
        if (!found) throw new Error(`apply_option: no hero-banner section found on page "${slug}"`);
        const nextSections = found.sections.map((s, i) =>
          i === found.index ? { ...s, config: { ...s.config, headline, ...(subheadline !== undefined ? { subheadline } : {}) } } : s,
        );
        const updated = await cms.updatePage(found.pageId, { sections: nextSections });
        return { shape, page: updated };
      }

      const templateKey = chosen.templateKey as string;
      const available = new Set(theming.listTemplates(pageType).map((t) => t.key));
      if (!available.has(templateKey)) {
        throw new Error(`apply_option: templateKey "${templateKey}" is not registered for page type "${pageType}"`);
      }
      theming.setDefaultTemplate(pageType, templateKey);
      return { shape, pageType, templateKey: theming.resolveTemplate(pageType) };
    },
  };
}
