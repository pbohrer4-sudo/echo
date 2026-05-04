import Anthropic from "@anthropic-ai/sdk";
import type { ToolCall, ToolName } from "@/lib/tools";
import { TOOL_NAMES } from "@/lib/tools";

export const CLAUDE_MODEL = "claude-sonnet-4-6";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
}): Promise<string> {
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

  return text;
}

// Chat with tools. Returns both the assistant's text reply and any
// tool_use blocks Claude emitted. Tool calls are validated against
// our known tool names — unknown names are dropped.
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
}): Promise<{ text: string; toolCalls: ToolCall[] }> {
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

  return { text, toolCalls };
}
