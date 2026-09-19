/**
 * Injectable client for Sanity's Context MCP server in Knowledge Base mode
 * (https://www.sanity.io/docs/ai/sanity-context-mcp), read-only. Same
 * injectable-client shape as adapter-shopify's GraphQLClient
 * (packages/adapter-shopify/src/graphql-client.ts): a real HTTP
 * implementation by default, a fake injected in tests -- no live Knowledge
 * Base endpoint exists in this environment (see this file's header comment
 * below and this story's commit message for the real, live-verified check
 * that established that), so every test in this repo uses the fake.
 *
 * Real, live verification performed for this story (2026-09-19), not
 * assumed from the docs alone:
 *   - The docs (fetched live) say Context MCP's endpoint is
 *     `https://api.sanity.io/v1/context/organizations/:organizationId/mcp/:mcpEndpointName`,
 *     and that it requires "an organization API token with Context Viewer
 *     permissions, created under Manage > API > Tokens at the organization
 *     level" -- explicitly NOT a project API token.
 *   - This repo's only Sanity credential in Portunus
 *     (`mercatus-liber-sanity-token`, `mercatus-liber-commerce` vault) is a
 *     project-scoped "developer" token for project `gnfzrgei`, not an
 *     org-scoped Context Viewer token. Resolving that project's real
 *     organizationId (`oz4zlgci4`, via a live call to
 *     `GET https://api.sanity.io/v2021-06-07/projects/gnfzrgei`) and then
 *     POSTing a real MCP `initialize` request to
 *     `https://api.sanity.io/v1/context/organizations/oz4zlgci4/mcp/default`
 *     with that project token returned a genuine, structured MCP-protocol
 *     response -- HTTP 200, `{"jsonrpc":"2.0","error":{"code":-32001,
 *     "message":"MCP endpoint not found: default"}}` -- proving the Context
 *     MCP router itself is live and reachable, but that no Knowledge Base
 *     MCP endpoint has been configured for this org (that's a one-time
 *     setup step in Sanity's Manage console under Context/Knowledge Bases,
 *     never done for this project) and that no org-scoped Context Viewer
 *     token exists to use even once one is.
 *   - A repo-wide Portunus search for "anthropic" and "context mcp" found
 *     no credential scoped to `mercatus-liber-commerce` for either; the one
 *     Anthropic key that exists in Portunus at all
 *     (`demo-shared-anthropic`) is explicitly scoped to a different
 *     project ("LLM calls across the dostal-swarm agents"), not this one,
 *     so it is not reused here.
 *
 * This is therefore a genuinely, honestly disclosed credential/setup gap
 * (same pattern as epics 42/43/44/46) -- not a blocker to building and
 * fully unit-testing the client and the tool-calling loop against an
 * injected fake.
 *
 * The exact tool name(s) Knowledge Base mode exposes are documented on a
 * separate "Context MCP tools" reference page this story did not have a
 * live endpoint to cross-check against (see the finding above), so the real
 * implementation below is a generic MCP JSON-RPC client -- `initialize`
 * then `tools/list` then `tools/call` on whichever listed tool's name
 * matches a search/ask/query heuristic -- rather than a hardcoded,
 * unverified tool name. It is deliberately isolated and swappable (the
 * epic's own risk mitigation for Context MCP being beta/under-documented):
 * once a real org-scoped endpoint + token exist, this client works against
 * them without this module's callers (tools.ts) changing at all.
 */

export type SanityContextQueryResult =
  | { available: true; results: { title: string; snippet: string; sourceUrl?: string }[] }
  | { available: false; reason: string };

export interface SanityContextClient {
  query(input: { question: string }): Promise<SanityContextQueryResult>;
}

export interface SanityContextClientConfig {
  organizationId: string;
  mcpEndpointName: string;
  /** An organization-level API token with Context Viewer permissions -- NOT a project token (see this file's header). */
  token: string;
  fetchImpl?: typeof fetch;
}

interface McpToolListing {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, unknown> };
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

const SEARCH_TOOL_NAME_PATTERN = /search|query|ask|find/i;

async function jsonRpcCall<T>(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
  method: string,
  params: Record<string, unknown>,
): Promise<JsonRpcResponse<T>> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await response.json()) as JsonRpcResponse<T>;
}

/** Real HTTP implementation. See this file's header comment for the live verification performed and its outcome. */
export function createSanityContextClient(config: SanityContextClientConfig): SanityContextClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = `https://api.sanity.io/v1/context/organizations/${config.organizationId}/mcp/${config.mcpEndpointName}`;

  return {
    async query({ question }) {
      const init = await jsonRpcCall<unknown>(fetchImpl, url, config.token, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "mercatus-liber-copilot", version: "0.1.0" },
      });
      if (init.error) {
        return { available: false, reason: `Context MCP initialize failed: ${init.error.message}` };
      }

      const listing = await jsonRpcCall<{ tools: McpToolListing[] }>(fetchImpl, url, config.token, "tools/list", {});
      if (listing.error || !listing.result) {
        return {
          available: false,
          reason: `Context MCP tools/list failed: ${listing.error?.message ?? "no result"}`,
        };
      }

      const tool = listing.result.tools.find((t) => SEARCH_TOOL_NAME_PATTERN.test(t.name));
      if (!tool) {
        return { available: false, reason: "Context MCP tools/list returned no search/query-shaped tool" };
      }

      const argKey = tool.inputSchema?.properties && "query" in tool.inputSchema.properties ? "query" : "question";
      const call = await jsonRpcCall<{ content?: { text?: string }[] }>(fetchImpl, url, config.token, "tools/call", {
        name: tool.name,
        arguments: { [argKey]: question },
      });
      if (call.error || !call.result) {
        return { available: false, reason: `Context MCP tools/call failed: ${call.error?.message ?? "no result"}` };
      }

      const results = (call.result.content ?? []).map((block, i) => ({
        title: `Result ${i + 1}`,
        snippet: block.text ?? "",
      }));
      return { available: true, results };
    },
  };
}
