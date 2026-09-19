import type Anthropic from "@anthropic-ai/sdk";
import type { AnthropicClient } from "./anthropic-client.js";
import { createCopilotToolHandlers } from "./handlers.js";
import { TOOL_DEFINITIONS, toAnthropicTools } from "./tool-definitions.js";
import type { CopilotToolDeps, ToolResult } from "./types.js";

export interface CopilotTurnInput {
  /** The admin's free-text request, e.g. "make the home page hero more seasonal". */
  requestText: string;
  /** Safety cap on tool-calling round trips within one turn. Defaults to 8. */
  maxIterations?: number;
}

export interface ToolCallRecord {
  name: string;
  input: Record<string, unknown>;
  result?: ToolResult;
  isError?: boolean;
}

export interface CopilotTurnResult {
  finalText: string;
  toolCalls: ToolCallRecord[];
  stopReason: Anthropic.Message["stop_reason"] | null;
}

const SYSTEM_PROMPT = `You are the Mercatus Liber storefront admin content copilot.

Scope, deliberately narrow (do not deviate):
- You may READ a page's current CMS sections (get_current_sections) and a page type's current
  layout template (get_current_template), and optionally search Sanity's content/schema
  Knowledge Base for background (search_sanity_context, which may honestly report itself
  unavailable -- that is expected in some deployments, not an error to work around).
- When the admin asks for a content or layout change, call propose_options with EXACTLY 2 or 3
  candidates in ONE of exactly two shapes: "swap_hero_copy" (new headline/subheadline for the
  page's hero-banner section) or "swap_template" (switch to a different already-registered
  layout template for that page type -- only use a templateKey returned by
  get_current_template's "available" list). Never invent a third shape or propose anything that
  isn't one of these two.
- Never call apply_option yourself unless the admin's message explicitly says which option they
  chose (by id or by clear description) AND asks you to apply it. apply_option requires
  confirm:true to actually execute -- omit it (or pass confirm:false) to preview first.
- After propose_options returns, summarize the candidates for the admin in your text response so
  they can choose. Keep responses concise.`;

/**
 * The tool-calling loop: a manual `while stop_reason indicates more tool
 * use` loop against the real Anthropic Messages API (via the injectable
 * AnthropicClient), executing this module's own read/propose/apply tool
 * handlers (handlers.ts) for every tool_use block Claude emits, and feeding
 * `tool_result` blocks back until Claude reaches a natural end_turn (or the
 * `maxIterations` safety cap). Every tool handler's success or thrown error
 * is captured as a `tool_result` (is_error: true on throw) so a single bad
 * or rejected tool call (e.g. apply_option without permission) does not
 * crash the whole turn -- the same "a tool failure is data the model sees,
 * not a request-level failure" posture the Anthropic tool-use docs
 * recommend. Callers that need to assert a rejection directly (as this
 * story's acceptance criteria do) can call handlers.ts's createCopilotToolHandlers(...).apply_option
 * directly instead of going through this loop -- see test/copilot-handlers.test.ts.
 */
export async function runCopilotTurn(
  anthropic: AnthropicClient,
  deps: CopilotToolDeps,
  input: CopilotTurnInput,
): Promise<CopilotTurnResult> {
  const handlers = createCopilotToolHandlers(deps);
  const tools = toAnthropicTools(TOOL_DEFINITIONS);
  const maxIterations = input.maxIterations ?? 8;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: input.requestText }];
  const toolCalls: ToolCallRecord[] = [];
  let lastMessage: Anthropic.Message | null = null;

  for (let i = 0; i < maxIterations; i++) {
    const response = await anthropic.createMessage({
      system: SYSTEM_PROMPT,
      max_tokens: 4096,
      tools,
      messages,
    });
    lastMessage = response;

    // A server-side-tool iteration cap hit mid-turn -- resume by re-sending, per the SDK's
    // documented manual-loop pattern. This loop declares no server tools, so this branch is
    // defensive rather than expected in practice.
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (toolUseBlocks.length === 0) break;

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const toolInput = block.input as Record<string, unknown>;
      const record: ToolCallRecord = { name: block.name, input: toolInput };
      const handler = handlers[block.name];
      try {
        if (!handler) throw new Error(`Unknown tool: ${block.name}`);
        const result = await handler(toolInput);
        record.result = result;
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        record.isError = true;
        record.result = { error: message };
        toolResults.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: message });
      }
      toolCalls.push(record);
    }

    messages.push({ role: "user", content: toolResults });
  }

  const finalText = (lastMessage?.content ?? [])
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return { finalText, toolCalls, stopReason: lastMessage?.stop_reason ?? null };
}
