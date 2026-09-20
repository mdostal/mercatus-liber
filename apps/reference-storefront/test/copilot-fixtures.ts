/**
 * Shared test fixtures for the copilot test suite (scc-06) -- builders for
 * minimally-valid Anthropic SDK response shapes, so individual test files
 * don't each hand-roll every required field of Anthropic.Message/
 * ToolUseBlock/TextBlock (id, container, stop_details, usage, caller, ...).
 */
import type Anthropic from "@anthropic-ai/sdk";

let messageCounter = 0;

export function fakeUsage(): Anthropic.Usage {
  return {
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    inference_geo: null,
    input_tokens: 10,
    output_tokens: 10,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
  };
}

export function fakeTextBlock(text: string): Anthropic.TextBlock {
  return { type: "text", text, citations: null };
}

export function fakeToolUseBlock(name: string, input: Record<string, unknown>, id?: string): Anthropic.ToolUseBlock {
  messageCounter += 1;
  return { type: "tool_use", id: id ?? `toolu_${messageCounter}`, name, input, caller: { type: "direct" } };
}

export function fakeMessage(content: Anthropic.ContentBlock[], stopReason: Anthropic.StopReason): Anthropic.Message {
  messageCounter += 1;
  return {
    id: `msg_${messageCounter}`,
    type: "message",
    role: "assistant",
    container: null,
    content,
    model: "claude-opus-5",
    stop_details: null,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: fakeUsage(),
  };
}
