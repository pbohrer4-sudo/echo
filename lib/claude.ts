import Anthropic from "@anthropic-ai/sdk";
import type { ToolCall, ToolName } from "@/lib/tools";
import { TOOL_NAMES } from "@/lib/tools";

// Identifizierter ToolCall — die id stammt aus dem Anthropic-tool_use-
// Block und wird benötigt um in einer Folge-Message ein tool_result
// dazu zu schicken (read-only-Roundtrips wie query_people).
export interface ToolCallWithId extends ToolCall {
  id: string;
}

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
// Claude emitted (mit IDs für Follow-up tool_results), und Token-Usage.
// Carries through `rawContent` so eine Folge-Runde mit tool_result die
// vollständige assistant-Message reproduzieren kann.
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
  toolCalls: ToolCallWithId[];
  rawContent: Anthropic.ContentBlock[];
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

  const toolCalls: ToolCallWithId[] = response.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .filter((b): b is Anthropic.ToolUseBlock & { name: ToolName } =>
      (TOOL_NAMES as readonly string[]).includes(b.name),
    )
    .map((b) => ({
      id: b.id,
      name: b.name,
      input: (b.input ?? {}) as Record<string, unknown>,
    }));

  return {
    text,
    toolCalls,
    rawContent: response.content,
    usage: extractUsage(response),
  };
}

// Folge-Turn nach einem read-only Tool-Call: schickt das tool_result
// als user-Turn rein und gibt Claude die Chance, eine finale gespochene
// Antwort zu formulieren. Kein neuer tools-Aufruf — wir wollen hier
// kein Verschachteln. Markdown wird beim Caller gestrippt.
export async function chatToolResultFollowup({
  messages,
  system,
  assistantContent,
  toolResults,
  tools,
  maxTokens = 512,
  apiKey,
}: {
  messages: ChatMessage[];
  system: string;
  assistantContent: Anthropic.ContentBlock[];
  toolResults: Array<{ tool_use_id: string; content: string }>;
  tools: Anthropic.Tool[];
  maxTokens?: number;
  apiKey?: string | null;
}): Promise<{ text: string; usage: AnthropicUsage }> {
  const apiMessages: Anthropic.MessageParam[] = [
    ...messages.map(
      (m): Anthropic.MessageParam => ({ role: m.role, content: m.content }),
    ),
    { role: "assistant", content: assistantContent },
    {
      role: "user",
      content: toolResults.map(
        (r): Anthropic.ToolResultBlockParam => ({
          type: "tool_result",
          tool_use_id: r.tool_use_id,
          content: r.content,
        }),
      ),
    },
  ];
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
    messages: apiMessages,
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { text, usage: extractUsage(response) };
}
