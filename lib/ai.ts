// Provider-agnostic dispatch layer. Reads the user's per-task model
// preference + BYO key map and routes to the right provider client.
// Today only Anthropic + ElevenLabs are wired; selecting a non-active
// model falls back to claude-sonnet-4-6 with a console warning so the
// app keeps working while we build the rest of the providers.
//
// Phase B will swap the body for a Vercel AI SDK call so swapping
// providers becomes a one-line change. The signatures here stay stable.

import { chat as anthropicChat, chatWithTools as anthropicChatWithTools, type ChatMessage } from "@/lib/claude";
import { synthesizeSpeech as elevenSynthesize } from "@/lib/elevenlabs";
import { modelById, type TaskId } from "@/lib/model-catalog";
import type { UserContext } from "@/lib/user-context";
import type Anthropic from "@anthropic-ai/sdk";
import type { ToolCall } from "@/lib/tools";

const FALLBACK_TEXT_MODEL = "anthropic/claude-sonnet-4-6";
const FALLBACK_TTS_MODEL = "elevenlabs/eleven_flash_v2_5";

function preferenceFor(ctx: UserContext, task: TaskId): string {
  const prefs = (ctx.model_preferences ?? {}) as Record<string, string>;
  return prefs[task] || "";
}

// Resolve the configured model for a task, falling back through the
// chain: user preference → catalog default → hard-coded fallback. Logs
// when we have to fall back from a non-active model.
function resolveTextModel(
  ctx: UserContext,
  task: TaskId,
): { model: string; apiKey: string | null } {
  const preference = preferenceFor(ctx, task);
  const candidate = modelById(preference);

  if (candidate?.available) {
    if (candidate.provider === "anthropic") {
      return {
        model: candidate.id.replace(/^anthropic\//, ""),
        apiKey: ctx.byo_keys?.anthropic ?? ctx.claude_key,
      };
    }
    // Non-Anthropic active providers will be wired in Phase B. For
    // now, surface the gap rather than silently falling back.
    console.warn(
      `[ai] task=${task} requested ${candidate.id} but only Anthropic is wired — falling back to ${FALLBACK_TEXT_MODEL}`,
    );
  }

  return {
    model: FALLBACK_TEXT_MODEL.replace(/^anthropic\//, ""),
    apiKey: ctx.claude_key,
  };
}

export async function chatForTask({
  ctx,
  task,
  messages,
  system,
  maxTokens,
}: {
  ctx: UserContext;
  task: TaskId;
  messages: ChatMessage[];
  system: string;
  maxTokens?: number;
}): Promise<string> {
  const { apiKey } = resolveTextModel(ctx, task);
  return anthropicChat({ messages, system, maxTokens, apiKey });
}

export async function chatWithToolsForTask({
  ctx,
  task,
  messages,
  system,
  tools,
  maxTokens,
}: {
  ctx: UserContext;
  task: TaskId;
  messages: ChatMessage[];
  system: string;
  tools: Anthropic.Tool[];
  maxTokens?: number;
}): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const { apiKey } = resolveTextModel(ctx, task);
  return anthropicChatWithTools({ messages, system, tools, maxTokens, apiKey });
}

export async function synthesizeForTask({
  ctx,
  text,
  voiceId,
}: {
  ctx: UserContext;
  text: string;
  voiceId?: string;
}): Promise<ArrayBuffer> {
  const preference = preferenceFor(ctx, "tts");
  const candidate = modelById(preference);
  const modelId =
    candidate?.available && candidate.provider === "elevenlabs"
      ? candidate.id.replace(/^elevenlabs\//, "")
      : FALLBACK_TTS_MODEL.replace(/^elevenlabs\//, "");

  return elevenSynthesize({
    text,
    voiceId: voiceId ?? ctx.voice_id ?? undefined,
    modelId,
    apiKey: ctx.byo_keys?.elevenlabs ?? ctx.elevenlabs_key,
  });
}
