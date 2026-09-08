/**
 * Plain JSON Schema tool definitions -- protocol-agnostic (resolves
 * docs/subsystems/14-ai-mcp-interface.md's open question 4). No MCP or zod
 * dependency here; mcp-server.ts is a thin wrapper that exposes these same
 * definitions over the MCP protocol. Legible to a human developer reading
 * this file directly, or reusable by a non-MCP integration later.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  category: "shopper" | "admin";
  /** True for every admin write tool -- see confirmation.ts and this epic's docs/ai-mcp-interface-decisions.md open question 1. */
  requiresConfirmation: boolean;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "search_products",
    description: "Search the catalog by free text. Read-only.",
    category: "shopper",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "Free-text search query" } },
    },
  },
  {
    name: "get_product",
    description: "Get a product and its SKUs by slug. Read-only.",
    category: "shopper",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "add_to_cart",
    description: "Add a SKU to a cart, creating a new cart if cartId is omitted. Reversible, spends nothing -- executes directly.",
    category: "shopper",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        cartId: { type: "string", description: "Omit to create a new cart" },
        skuId: { type: "string" },
        quantity: { type: "number" },
      },
      required: ["skuId", "quantity"],
    },
  },
  {
    name: "get_cart",
    description: "Get a cart's current contents. Read-only.",
    category: "shopper",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { cartId: { type: "string" } },
      required: ["cartId"],
    },
  },
  {
    name: "start_checkout",
    description:
      "Start checkout for a cart. Returns a Stripe-hosted checkout redirect URL -- this never completes a charge itself; Stripe's own hosted page is the human-in-the-loop confirmation step, so this executes directly with no separate confirm flag.",
    category: "shopper",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        cartId: { type: "string" },
        idempotencyKey: { type: "string" },
        shippingInfo: {
          type: "object",
          properties: { name: { type: "string" }, email: { type: "string" }, address: { type: "string" } },
          required: ["name", "email", "address"],
        },
        successUrl: { type: "string" },
        cancelUrl: { type: "string" },
        customerId: { type: "string", description: "Omit for guest checkout" },
      },
      required: ["cartId", "idempotencyKey", "shippingInfo", "successUrl", "cancelUrl"],
    },
  },
  {
    name: "get_order_status",
    description: "Get an order's current status and items. Read-only.",
    category: "shopper",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    },
  },
  {
    name: "create_product",
    description: "Create a new product (draft status). Changes public-facing content -- requires confirm:true, otherwise returns a preview.",
    category: "admin",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        identifyingAttributeKeys: { type: "array", items: { type: "string" } },
        confirm: { type: "boolean", description: "Must be true to actually execute; omit or false to preview" },
      },
      required: ["slug", "title", "description", "identifyingAttributeKeys"],
    },
  },
  {
    name: "update_product",
    description: "Update an existing product's fields. Changes public-facing content -- requires confirm:true, otherwise returns a preview.",
    category: "admin",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        slug: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        identifyingAttributeKeys: { type: "array", items: { type: "string" } },
        confirm: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "manage_cms_page",
    description: "Update and/or publish a CMS page. Changes public-facing content -- requires confirm:true, otherwise returns a preview.",
    category: "admin",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        action: { type: "string", enum: ["update", "publish"] },
        title: { type: "string" },
        sections: { type: "array", items: { type: "object" } },
        confirm: { type: "boolean" },
      },
      required: ["id", "action"],
    },
  },
  {
    name: "adjust_inventory",
    description: "Set a SKU's on-hand stock level. Changes public availability -- requires confirm:true, otherwise returns a preview.",
    category: "admin",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: {
        skuId: { type: "string" },
        onHand: { type: "number" },
        confirm: { type: "boolean" },
      },
      required: ["skuId", "onHand"],
    },
  },
];
