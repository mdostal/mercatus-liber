import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommerceToolDeps } from "../src/types.js";

// setRequestHandler is called in a fixed order by mcp-server.ts (ListTools,
// then CallTool) -- captured by call order rather than inspecting the SDK's
// internal zod schema shape, which is an implementation detail.
const registeredHandlersInOrder: ((request: unknown) => Promise<unknown>)[] = [];
const mockSetRequestHandler = vi.fn((_schema: unknown, handler: (request: unknown) => Promise<unknown>) => {
  registeredHandlersInOrder.push(handler);
});

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn().mockImplementation(function MockServer(this: unknown) {
    Object.assign(this as object, { setRequestHandler: mockSetRequestHandler });
  }),
}));

const { createCommerceMcpServer } = await import("../src/mcp-server.js");

function buildFakeDeps(): CommerceToolDeps {
  return {
    catalog: { getProductBySlug: vi.fn(), listSkusByProduct: vi.fn() },
    search: { query: vi.fn(async () => [{ id: "p1", title: "T", description: "D" }]) },
    cart: { createCart: vi.fn(), addItem: vi.fn(), getCart: vi.fn() },
    checkout: { startCheckout: vi.fn(), getOrder: vi.fn() },
    catalogAdmin: { createProduct: vi.fn(), updateProduct: vi.fn() },
    cms: { updatePage: vi.fn(), publishPage: vi.fn() },
    inventory: { getStock: vi.fn(), setStock: vi.fn() },
  };
}

describe("createCommerceMcpServer", () => {
  beforeEach(() => {
    registeredHandlersInOrder.length = 0;
    mockSetRequestHandler.mockClear();
    createCommerceMcpServer(buildFakeDeps());
  });

  it("registers exactly 2 request handlers (ListTools, CallTool)", () => {
    expect(registeredHandlersInOrder).toHaveLength(2);
  });

  it("the ListTools handler returns all 10 tool definitions in MCP Tool shape", async () => {
    const [listHandler] = registeredHandlersInOrder;
    const result = (await listHandler!({})) as { tools: { name: string; description: string; inputSchema: unknown }[] };

    expect(result.tools).toHaveLength(10);
    expect(result.tools.every((t) => typeof t.name === "string" && typeof t.description === "string" && typeof t.inputSchema === "object")).toBe(true);
  });

  it("the CallTool handler delegates to the matching tool handler and wraps the result as MCP content", async () => {
    const [, callHandler] = registeredHandlersInOrder;
    const result = (await callHandler!({ params: { name: "search_products", arguments: { text: "dragon" } } })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0]!.type).toBe("text");
    expect(JSON.parse(result.content[0]!.text)).toEqual([{ id: "p1", title: "T", description: "D" }]);
  });

  it("returns an MCP error result for an unknown tool name instead of throwing", async () => {
    const [, callHandler] = registeredHandlersInOrder;
    const result = (await callHandler!({ params: { name: "not_a_real_tool", arguments: {} } })) as { isError?: boolean };

    expect(result.isError).toBe(true);
  });

  it("returns an MCP error result when a handler throws, instead of propagating the exception", async () => {
    registeredHandlersInOrder.length = 0;
    const deps = buildFakeDeps();
    (deps.search.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    createCommerceMcpServer(deps);

    const [, callHandler] = registeredHandlersInOrder;
    const result = (await callHandler!({ params: { name: "search_products", arguments: {} } })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("boom");
  });
});
