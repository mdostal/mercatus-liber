import type Anthropic from "@anthropic-ai/sdk";

/**
 * Protocol-agnostic JSON Schema tool definitions -- same shape as
 * @mercatus-liber/ai-interface's ToolDefinition
 * (packages/ai-interface/src/tool-definitions.ts), deliberately mirrored
 * rather than reused directly because these tools are scoped to CMS/theming
 * reads plus the two narrow copilot-only mutation shapes, not the general
 * commerce tool set. `toAnthropicTools()` below adapts this same list to
 * the Anthropic SDK's `Tool` shape ({name, description, input_schema}), so
 * this file stays legible independent of which LLM SDK consumes it.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  category: "read" | "propose" | "apply";
  /** True only for apply_option -- see confirmation.ts (re-exported from @mercatus-liber/ai-interface) and permission.ts. */
  requiresConfirmation: boolean;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const HERO_CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "A short, stable id for this candidate, e.g. 'a', 'b', 'c'." },
    label: { type: "string", description: "Short human-readable label for this option, e.g. 'Autumn warmth'." },
    headline: { type: "string" },
    subheadline: { type: "string" },
  },
  required: ["id", "label", "headline"],
};

const TEMPLATE_CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "A short, stable id for this candidate, e.g. 'a', 'b', 'c'." },
    label: { type: "string" },
    templateKey: { type: "string", description: "Must be one of the keys returned by get_current_template's 'available' list." },
  },
  required: ["id", "label", "templateKey"],
};

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "get_current_sections",
    description: "Get a page's current CMS sections (ComponentInstance[]) by page type and slug. Read-only.",
    category: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        pageType: { type: "string" },
        slug: { type: "string" },
      },
      required: ["pageType", "slug"],
    },
  },
  {
    name: "get_current_template",
    description: "Get a page type's current resolved layout template plus every other template registered for that page type. Read-only.",
    category: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { pageType: { type: "string" } },
      required: ["pageType"],
    },
  },
  {
    name: "search_sanity_context",
    description:
      "Semantic search over Sanity's Context MCP Knowledge Base (schema + content) for background before proposing options. Read-only. May report itself unavailable if no Knowledge Base is configured for this project -- treat that as informational, not an error.",
    category: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { question: { type: "string" } },
      required: ["question"],
    },
  },
  {
    name: "propose_options",
    description:
      "Propose 2-3 candidate options for the admin's request, in one of exactly two fixed shapes: 'swap_hero_copy' (new headline/subheadline for a page's hero-banner section) or 'swap_template' (a different registered layout template for a page type). Deliberately narrow, not open-ended -- see design-discussion.md #2e. Read-only: does not write anything.",
    category: "propose",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        shape: { type: "string", enum: ["swap_hero_copy", "swap_template"] },
        pageType: { type: "string" },
        slug: { type: "string" },
        candidates: {
          type: "array",
          minItems: 2,
          maxItems: 3,
          items: { oneOf: [HERO_CANDIDATE_SCHEMA, TEMPLATE_CANDIDATE_SCHEMA] },
        },
      },
      required: ["shape", "pageType", "slug", "candidates"],
    },
  },
  {
    name: "apply_option",
    description:
      "Write the admin's chosen option through the real CmsService/ThemingService. Requires confirm:true (otherwise returns a preview) AND an admin session with 'mutate' permission (otherwise rejected) -- same discipline as every other admin mutation in this repo.",
    category: "apply",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: {
        shape: { type: "string", enum: ["swap_hero_copy", "swap_template"] },
        pageType: { type: "string" },
        slug: { type: "string" },
        chosen: {
          type: "object",
          description: "For swap_hero_copy: {headline, subheadline?}. For swap_template: {templateKey}.",
        },
        confirm: { type: "boolean", description: "Must be true to actually execute; omit or false to preview" },
      },
      required: ["shape", "pageType", "slug", "chosen"],
    },
  },
];

/** Adapts TOOL_DEFINITIONS to the Anthropic SDK's Tool shape for a Messages API request. */
export function toAnthropicTools(defs: readonly ToolDefinition[] = TOOL_DEFINITIONS): Anthropic.Tool[] {
  return defs.map((def) => ({
    name: def.name,
    description: def.description,
    input_schema: def.inputSchema,
  }));
}
