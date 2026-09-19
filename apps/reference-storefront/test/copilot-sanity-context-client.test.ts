/**
 * scc-06: unit test for the real Sanity Context MCP client implementation
 * (lib/copilot/sanity-context-client.ts) against an injected fake `fetch`.
 * The "unavailable" scenario below is not hypothetical -- it reproduces,
 * byte-for-byte, the real JSON-RPC error this story got back from a live
 * call to `https://api.sanity.io/v1/context/organizations/oz4zlgci4/mcp/default`
 * using this repo's actual `mercatus-liber-sanity-token` (see this file's
 * sibling client's header comment for the full live-verification writeup):
 * a genuine, structured MCP response proving the router is reachable, but
 * with no Knowledge Base MCP endpoint configured for this org.
 */
import { describe, expect, it } from "vitest";
import { createSanityContextClient } from "../lib/copilot/sanity-context-client.js";

interface ScriptedCall {
  method: string;
  response: unknown;
}

function fakeFetch(script: ScriptedCall[]) {
  let i = 0;
  const calls: { method: string }[] = [];
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string };
    calls.push({ method: body.method });
    const next = script[i++];
    if (!next) throw new Error("fakeFetch: ran out of scripted responses");
    return new Response(JSON.stringify(next.response), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("createSanityContextClient (scc-06 -- real implementation, fake fetch)", () => {
  it("initializes, lists tools, calls the matching search tool, and returns real-shaped results", async () => {
    const { impl, calls } = fakeFetch([
      { method: "initialize", response: { jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "Sanity" } } } },
      {
        method: "tools/list",
        response: {
          jsonrpc: "2.0",
          id: 1,
          result: { tools: [{ name: "search_knowledge_base", inputSchema: { properties: { query: {} } } }] },
        },
      },
      {
        method: "tools/call",
        response: { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "The home page hero uses..." }] } },
      },
    ]);

    const client = createSanityContextClient({
      organizationId: "oz4zlgci4",
      mcpEndpointName: "storefront-kb",
      token: "fake-org-token",
      fetchImpl: impl,
    });
    const result = await client.query({ question: "what does the home page hero say?" });

    expect(result).toEqual({ available: true, results: [{ title: "Result 1", snippet: "The home page hero uses..." }] });
    expect(calls.map((c) => c.method)).toEqual(["initialize", "tools/list", "tools/call"]);
  });

  it("honestly reports unavailable, reproducing the real live 'no Knowledge Base endpoint configured' response this story found", async () => {
    const { impl } = fakeFetch([
      {
        method: "initialize",
        response: { jsonrpc: "2.0", error: { code: -32001, message: "MCP endpoint not found: default" }, id: null },
      },
    ]);

    const client = createSanityContextClient({
      organizationId: "oz4zlgci4",
      mcpEndpointName: "default",
      token: "fake-project-token",
      fetchImpl: impl,
    });
    const result = await client.query({ question: "what does the home page hero say?" });

    expect(result).toEqual({
      available: false,
      reason: "Context MCP initialize failed: MCP endpoint not found: default",
    });
  });

  it("reports unavailable when tools/list returns no search/query-shaped tool", async () => {
    const { impl } = fakeFetch([
      { method: "initialize", response: { jsonrpc: "2.0", id: 1, result: {} } },
      { method: "tools/list", response: { jsonrpc: "2.0", id: 1, result: { tools: [{ name: "deploy_schema" }] } } },
    ]);

    const client = createSanityContextClient({ organizationId: "org", mcpEndpointName: "kb", token: "t", fetchImpl: impl });
    const result = await client.query({ question: "anything?" });

    expect(result).toEqual({ available: false, reason: "Context MCP tools/list returned no search/query-shaped tool" });
  });
});
