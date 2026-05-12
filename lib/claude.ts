import Anthropic from "@anthropic-ai/sdk";
import type { ToolCall, ToolName } from "@/lib/tools";
import { TOOL_NAMES } from "@/lib/tools";

export const CLAUDE_MODEL = "claude-sonnet-4-6";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

let sharedClient: Anthropic | null = null;

function getClient(apiKey?: string | null): Anthropic {
  if (apiKey) {
    return new Anthropic({ apiKey });
  }
  if (!sharedClient) {
    sharedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return sharedClient;
}

function extractUsage(response: Anthropic.Message): AnthropicUsage {
  return {
    input_tokens: response.usage?.input_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? 0,
    cache_creation_input_tokens:
      response.usage?.cache_creation_input_tokens ?? undefined,
    cache_read_input_tokens:
      response.usage?.cache_read_input_tokens ?? undefined,
  };
}

// Single-shot, non-streaming chat. The system prompt is marked cacheable so
// repeated turns within ~5 min reuse the cached prefix.
export async function chat({
  messages,
  system,
  maxTokens = 512,
  apiKey,
}: {
  messages: ChatMessage[];
  system: string;
  maxTokens?: number;
  apiKey?: string | null;
}): Promise<{ text: string; usage: AnthropicUsage }> {
  const response = await getClient(apiKey).messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return { text, usage: extractUsage(response) };
}

// Chat with tools. Returns the assistant's text reply, tool_use blocks
// Claude emitted, and token usage for spend-tracking.
export async function chatWithTools({
  messages,
  system,
  tools,
  maxTokens = 1024,
  apiKey,
}: {
  messages: ChatMessage[];
  system: string;
  tools: Anthropic.Tool[];
  maxTokens?: number;
  apiKey?: string | null;
}): Promise<{
  text: string;
  toolCalls: ToolCall[];
  usage: AnthropicUsage;
}> {
  const response = await getClient(apiKey).messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools,
    messages,
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const toolCalls = response.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .filter((b): b is Anthropic.ToolUseBlock & { name: ToolName } =>
      (TOOL_NAMES as readonly string[]).includes(b.name),
    )
    .map((b) => ({
      name: b.name,
      input: (b.input ?? {}) as Record<string, unknown>,
    }));

  return { text, toolCalls, usage: extractUsage(response) };
}
