/**
 * Injectable wrapper around the real Anthropic Messages API
 * (@anthropic-ai/sdk) -- same injectable-client shape as adapter-shopify's
 * GraphQLClient (packages/adapter-shopify/src/graphql-client.ts): a real
 * SDK-backed implementation by default, a fake injected in every unit test.
 *
 * No Anthropic API key exists in this environment scoped to this project:
 * a real Portunus check (2026-09-19) of the `mercatus-liber-commerce` vault
 * found Clerk/Sanity/PostHog/Supabase/Convex/MongoDB credentials but no
 * Anthropic key, and a repo-wide search found only `demo-shared-anthropic`,
 * explicitly scoped to a different project ("LLM calls across the
 * dostal-swarm agents"), so it was not reused here. This is a genuinely
 * disclosed credential gap (same honest pattern as epics 42/43/44/46) --
 * loop.ts and every tool handler are still built and fully unit-tested
 * against this interface with an injected fake, exactly like
 * adapter-shopify/adapter-printful's own disclosed-double pattern for APIs
 * with no live credential.
 */
import Anthropic from "@anthropic-ai/sdk";

/**
 * Narrowed request shape: `model` is fixed by this wrapper's config (not
 * per-call) so a fake test client never needs to assert on it, and
 * `stream` is deliberately unsupported -- this loop only ever needs one
 * complete `Message` per turn, per the manual-agentic-loop pattern.
 */
export type CopilotMessageParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "model" | "stream">;

export interface AnthropicClient {
  createMessage(params: CopilotMessageParams): Promise<Anthropic.Message>;
}

export interface AnthropicClientConfig {
  apiKey: string;
  /**
   * Defaults to Claude Opus 5 (`claude-opus-5`) -- Anthropic's current
   * flagship model, per this repo's own claude-api skill guidance ("always
   * use claude-opus-5 unless a different model is explicitly named").
   * Overridable via ANTHROPIC_MODEL for cost tuning in a real deployment.
   */
  model?: string;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

/** Real, SDK-backed implementation. Never constructed by a unit test -- see this file's header. */
export function createAnthropicClient(config: AnthropicClientConfig): AnthropicClient {
  const model = config.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const sdk = new Anthropic({ apiKey: config.apiKey, fetch: config.fetchImpl });

  return {
    async createMessage(params) {
      return sdk.messages.create({ model, ...params });
    },
  };
}
