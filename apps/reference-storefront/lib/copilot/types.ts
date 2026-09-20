import type { AdminSession } from "@mercatus-liber/admin-auth";
import type { CmsService } from "@mercatus-liber/cms";
import type { ThemingService } from "@mercatus-liber/theming";
import type { SanityContextClient } from "./sanity-context-client";

/**
 * scc-06's deliberately narrow first scope (design-discussion.md #2e): the
 * copilot never generates fully open-ended page mutations, only one of a
 * fixed, closed set of proposal "shapes". Adding a third shape later is a
 * one-line addition here plus a handler branch in handlers.ts -- not a
 * redesign.
 */
export type ProposalShape = "swap_hero_copy" | "swap_template";

/** One candidate for the "swap_hero_copy" shape -- mutates a page's hero-banner section's config. */
export interface HeroCopyCandidate {
  id: string;
  label: string;
  headline: string;
  subheadline?: string;
}

/** One candidate for the "swap_template" shape -- mutates a page type's resolved layout template. */
export interface TemplateSwapCandidate {
  id: string;
  label: string;
  templateKey: string;
}

export interface ProposedOptions {
  shape: ProposalShape;
  pageType: string;
  slug: string;
  candidates: (HeroCopyCandidate | TemplateSwapCandidate)[];
}

/**
 * Every dependency below is a narrow structural interface satisfied by the
 * real CmsService/ThemingService/AdminSession without this module importing
 * their concrete implementations beyond the types -- same "narrow
 * dependency" discipline as @mercatus-liber/ai-interface's CommerceToolDeps.
 */
export interface CopilotToolDeps {
  cms: CmsService;
  theming: ThemingService;
  /** Null when no admin is authenticated -- read tools still work; apply_option always rejects. */
  session: AdminSession | null;
  /**
   * Optional: the Sanity Context MCP (Knowledge Base mode) client. Omitted
   * entirely when no org-scoped Context Viewer credential is configured
   * (the genuinely-disclosed gap this story's research step found) -- the
   * search_sanity_context tool then honestly reports itself unavailable
   * instead of being silently dropped from the tool list.
   */
  sanityContext?: SanityContextClient;
}

export type ToolResult = unknown;
