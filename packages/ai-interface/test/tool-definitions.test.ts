import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "../src/tool-definitions.js";

const SHOPPER_TOOLS = ["search_products", "get_product", "add_to_cart", "get_cart", "start_checkout", "get_order_status"];
const ADMIN_TOOLS = ["create_product", "update_product", "manage_cms_page", "adjust_inventory"];

describe("TOOL_DEFINITIONS", () => {
  it("ships exactly the 6 shopper + 4 admin tools", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(10);
    expect(TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual([...SHOPPER_TOOLS, ...ADMIN_TOOLS].sort());
  });

  it("every tool has a name, description, category, and a valid object-shaped JSON Schema inputSchema", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(["shopper", "admin"]).toContain(tool.category);
      expect(tool.inputSchema.type).toBe("object");
      expect(typeof tool.inputSchema.properties).toBe("object");
    }
  });

  it("requiresConfirmation is true for exactly the 4 admin tools and false for all 6 shopper tools", () => {
    for (const tool of TOOL_DEFINITIONS) {
      const expected = ADMIN_TOOLS.includes(tool.name);
      expect(tool.requiresConfirmation).toBe(expected);
    }
  });
});
