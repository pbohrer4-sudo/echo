"use server";

// On-demand AI keyword extraction for synergies (Option 1, 2026-06-07).
// Reads the person's free-text synergies, asks Claude for 3-8 short
// reusable keyword tags (e.g. "Fundraising", "Intro:Stripe", "Hiring"),
// and stores them in people.synergy_tags for filtering/search.
//
// On-demand (button-triggered) so there's no background token burn —
// see also the "Verschlagworten" button in synergy-tags-button.tsx.

import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/claude";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/user-context";

const TOOL: Anthropic.Tool = {
  name: "tag_synergies",
  description:
    "Extrahiere kurze, wiederverwendbare Schlagworte aus den Synergie-Notizen einer Person, damit man sie filtern/suchen kann. 3-8 Tags, jeweils 1-3 Wörter, auf Deutsch oder als gängiger Fachbegriff. Beispiele: 'Fundraising', 'Stripe-Intro', 'Hiring', 'Solar', 'Berliner Tech-Szene'. Keine ganzen Sätze, keine Duplikate.",
  input_schema: {
    type: "object",
    properties: {
      tags: {
        type: "array",
        items: { type: "string" },
        description: "3-8 kurze Schlagworte.",
      },
    },
    required: ["tags"],
  },
};

let sharedClient: Anthropic | null = null;
function getClient(apiKey?: string | null): Anthropic {
  if (apiKey) return new Anthropic({ apiKey });
  if (!sharedClient) {
    sharedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return sharedClient;
}

// Remove a single synergy keyword tag (quick × on the chip).
export async function removeSynergyTag(
  personId: string,
  tag: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht angemeldet" };

  const { data: person } = await supabase
    .from("people")
    .select("synergy_tags")
    .eq("id", personId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!person) return { ok: false, error: "Person nicht gefunden" };

  const current = Array.isArray(person.synergy_tags)
    ? (person.synergy_tags as string[])
    : [];
  const next = current.filter(
    (t) => t.toLowerCase() !== tag.toLowerCase(),
  );

  const { error } = await supabase
    .from("people")
    .update({ synergy_tags: next })
    .eq("id", personId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

export async function extractSynergyTags(
  personId: string,
): Promise<{ ok: boolean; error?: string; tags?: string[] }> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: "Nicht angemeldet" };

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("synergies")
    .eq("id", personId)
    .eq("user_id", ctx.user_id)
    .maybeSingle();

  const synergies = Array.isArray(person?.synergies)
    ? (person!.synergies as string[]).filter((s) => s.trim())
    : [];
  if (synergies.length === 0) {
    return { ok: false, error: "Keine Synergien zum Verschlagworten." };
  }

  try {
    const response = await getClient(ctx.claude_key).messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "tag_synergies" },
      messages: [
        {
          role: "user",
          content: `Synergie-Notizen:\n${synergies.map((s) => `- ${s}`).join("\n")}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const raw = (toolUse?.input as { tags?: unknown })?.tags;
    const tags = Array.isArray(raw)
      ? Array.from(
          new Set(
            raw
              .filter((t): t is string => typeof t === "string")
              .map((t) => t.trim())
              .filter(Boolean),
          ),
        ).slice(0, 12)
      : [];

    if (tags.length === 0) {
      return { ok: false, error: "Keine Tags extrahiert." };
    }

    const { error } = await supabase
      .from("people")
      .update({ synergy_tags: tags })
      .eq("id", personId)
      .eq("user_id", ctx.user_id);
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/people/${personId}`);
    return { ok: true, tags };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Extraktion fehlgeschlagen",
    };
  }
}
