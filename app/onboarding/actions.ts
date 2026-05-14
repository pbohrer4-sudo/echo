"use server";

// Server-Actions für den Onboarding-Wizard. Jeder Step bekommt eine
// eigene Action; alle ziehen den nächsten Step aus lib/onboarding +
// redirecten. Skip-Pfad markiert den Step als skipped damit Admin-
// Tracking erkennt was übersprungen wurde.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  markStepDone,
  nextStep,
  type OnboardingStep,
} from "@/lib/onboarding";
import { getOrCreateSelfPerson } from "@/lib/people";

function nextRoute(step: OnboardingStep): string {
  if (step === "done") return "/heute";
  return `/onboarding/${step}`;
}

async function advance(current: OnboardingStep, skipped = false): Promise<never> {
  const progress = await markStepDone(current, { skipped });
  const next = nextStep(progress);
  // 'done' wird explizit via completeOnboarding gesetzt — der nextStep
  // im Wizard ist bei vorletzten Schritten 'done', das mapping auf
  // /heute übernimmt nextRoute().
  redirect(nextRoute(next));
}

// ─────────────────────────── Welcome ──────────────────────────────

export async function completeWelcome(formData: FormData): Promise<void> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (displayName) {
    await supabase
      .from("profiles")
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    // Self-Person auch umbenennen damit Header + Avatar konsistent sind.
    const self = await getOrCreateSelfPerson();
    if (self) {
      await supabase
        .from("people")
        .update({ name: displayName, updated_at: new Date().toISOString() })
        .eq("id", self.id);
    }
  }
  await advance("welcome");
}

// ─────────────────────────── Profil ───────────────────────────────

export async function completeProfile(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const timezone = String(formData.get("timezone") ?? "").trim();
  const language = String(formData.get("language") ?? "de").trim();
  const debriefTime = String(formData.get("debrief_time") ?? "").trim();

  const update: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };
  if (timezone) update.timezone = timezone;
  if (language) update.language = language;
  if (debriefTime && /^\d{2}:\d{2}$/.test(debriefTime)) {
    update.debrief_time = `${debriefTime}:00`;
  }

  await supabase.from("profiles").update(update).eq("id", user.id);
  await advance("profile");
}

// ─────────────────────────── BYOK ─────────────────────────────────

export async function completeByok(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const claudeKey = String(formData.get("claude_key") ?? "").trim();
  const elevenKey = String(formData.get("elevenlabs_key") ?? "").trim();

  const update: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
  };
  if (claudeKey) update.claude_key_byo = claudeKey;
  if (elevenKey) update.elevenlabs_key_byo = elevenKey;

  if (claudeKey || elevenKey) {
    await supabase.from("profiles").update(update).eq("id", user.id);
  }
  await advance("byok", !claudeKey && !elevenKey);
}

export async function skipByok(): Promise<void> {
  await advance("byok", true);
}

// ─────────────────────── Erste Person ─────────────────────────────

export async function completeFirstPerson(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    const company = String(formData.get("company") ?? "").trim() || null;
    const role = String(formData.get("role") ?? "").trim() || null;
    await supabase.from("people").insert({
      user_id: user.id,
      name,
      company,
      role,
      is_self: false,
      mode: "active",
    });
  }
  await advance("first_person", !name);
}

export async function skipFirstPerson(): Promise<void> {
  await advance("first_person", true);
}

// ─────────────────────────── Done ─────────────────────────────────

export async function completeOnboarding(): Promise<void> {
  await markStepDone("done");
  redirect("/heute");
}
