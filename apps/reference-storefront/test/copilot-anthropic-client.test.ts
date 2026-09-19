/**
 * scc-06: unit test for the real, SDK-backed AnthropicClient implementation
 * (lib/copilot/anthropic-client.ts) against an injected fake `fetch` --
 * same "test the real adapter's wiring, not a hand-rolled substitute"
 * posture as adapter-shopify/test/adapter.test.ts, which exercises
 * createShopifyAdapter itself against a fake fetch rather than only testing
 * a fake adapter object. No live ANTHROPIC_API_KEY exists for this project
 * (see anthropic-client.ts's header comment), so this never calls the real
 * API -- it proves createAnthropicClient constructs a real
 * @anthropic-ai/sdk client that issues an HTTP request through the
 * injected fetch and returns the parsed Message.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient, DEFAULT_ANTHROPIC_MODEL } from "../lib/copilot/anthropic-client.js";
import { fakeMessage, fakeTextBlock } from "./copilot-fixtures.js";

function fakeFetch(body: Anthropic.Message) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("createAnthropicClient (scc-06 -- real implementation, fake fetch)", () => {
  it("issues a real HTTP request via the injected fetch and returns the parsed Message", async () => {
    const scripted = fakeMessage([fakeTextBlock("hello from the fake API")], "end_turn");
    const { impl, calls } = fakeFetch(scripted);

    const client = createAnthropicClient({ apiKey: "sk-ant-fake", fetchImpl: impl });
    const result = await client.createMessage({ max_tokens: 4096, messages: [{ role: "user", content: "hi" }] });

    expect(result).toEqual(scripted);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("api.anthropic.com");
    const sentBody = JSON.parse(String(calls[0]!.init?.body));
    expect(sentBody.model).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(sentBody.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("uses an explicitly configured model instead of the default", async () => {
    const scripted = fakeMessage([fakeTextBlock("ok")], "end_turn");
    const { impl, calls } = fakeFetch(scripted);

    const client = createAnthropicClient({ apiKey: "sk-ant-fake", model: "claude-sonnet-5", fetchImpl: impl });
    await client.createMessage({ max_tokens: 1024, messages: [{ role: "user", content: "hi" }] });

    const sentBody = JSON.parse(String(calls[0]!.init?.body));
    expect(sentBody.model).toBe("claude-sonnet-5");
  });
});
