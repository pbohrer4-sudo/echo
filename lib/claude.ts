import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = "claude-sonnet-4-6";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

// Single-shot, non-streaming chat. The system prompt is marked cacheable so
// repeated turns within ~5 min reuse the cached prefix.
export async function chat({
  messages,
  system,
  maxTokens = 512,
}: {
  messages: ChatMessage[];
  system: string;
  maxTokens?: number;
}): Promise<string> {
  const response = await getClient().messages.create({
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
