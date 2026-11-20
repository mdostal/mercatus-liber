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

describe("provider catalog tools", () => {
  it("are offered only when the store wires a provider catalog, and bring-over needs confirm:true", async () => {
    registeredHandlersInOrder.length = 0;
    const bringOver = vi.fn(async () => ({ productId: "p9", skus: 2 }));
    createCommerceMcpServer({ ...buildFakeDeps(), providerCatalog: { providerName: "Printful", search: vi.fn(async () => [{ id: "71", name: "Unisex Staple T-Shirt", inStore: false }]), getProduct: vi.fn(async () => null), bringOver } });
    const [listHandler, callHandler] = registeredHandlersInOrder;
    const tools = ((await listHandler!({})) as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(tools).toHaveLength(13);
    expect(tools).toEqual(expect.arrayContaining(["provider_catalog_search", "provider_catalog_get_product", "provider_catalog_bring_over"]));
    const search = (await callHandler!({ params: { name: "provider_catalog_search", arguments: { text: "bella", limit: 500 } } })) as { content: { text: string }[] };
    expect(JSON.parse(search.content[0]!.text)).toEqual([{ id: "71", name: "Unisex Staple T-Shirt", inStore: false }]);
    const args = { productId: "71", title: "Tee", slug: "tee", technique: "dtg", colors: ["Black"], sizes: ["M"], retailCents: 2400 };
    const preview = (await callHandler!({ params: { name: "provider_catalog_bring_over", arguments: args } })) as { content: { text: string }[] };
    expect(JSON.parse(preview.content[0]!.text)).toMatchObject({ requiresConfirmation: true, preview: { action: "provider_catalog_bring_over" } });
    expect(bringOver).not.toHaveBeenCalled();
    await callHandler!({ params: { name: "provider_catalog_bring_over", arguments: { ...args, confirm: true } } });
    expect(bringOver).toHaveBeenCalledWith(args);
  });

  it("are not offered without one", async () => {
    registeredHandlersInOrder.length = 0;
    createCommerceMcpServer(buildFakeDeps());
    const [listHandler, callHandler] = registeredHandlersInOrder;
    expect(((await listHandler!({})) as { tools: unknown[] }).tools).toHaveLength(10);
    expect(((await callHandler!({ params: { name: "provider_catalog_search", arguments: {} } })) as { isError?: boolean }).isError).toBe(true);
  });
});
