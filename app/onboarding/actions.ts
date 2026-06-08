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
import { getOrCreateTag, addTagToPerson } from "@/lib/tags";
import { addPassion } from "@/lib/passions";

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
  const primaryLanguage = String(formData.get("primary_language") ?? "").trim();
  const secondaryLanguage = String(
    formData.get("secondary_language") ?? "",
  ).trim();

  const update: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };
  if (timezone) update.timezone = timezone;
  if (language) update.language = language;
  if (debriefTime && /^\d{2}:\d{2}$/.test(debriefTime)) {
    update.debrief_time = `${debriefTime}:00`;
  }
  await supabase.from("profiles").update(update).eq("id", user.id);

  // Mirror the communication language onto the self-person.
  const self = await getOrCreateSelfPerson();
  if (self) {
    await supabase
      .from("people")
      .update({
        primary_language: primaryLanguage || null,
        secondary_language: secondaryLanguage || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", self.id);
  }
  await advance("profile");
}

// ─────────────────────────── Interests ────────────────────────────

function parseList(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function completeInterests(formData: FormData): Promise<void> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) redirect("/login");

  const interests = parseList(formData.get("interests"));
  const self = await getOrCreateSelfPerson();
  if (self && interests.length > 0) {
    for (const name of interests) {
      const tag = await getOrCreateTag({
        name,
        cluster: "interests",
        createdBy: "user",
      });
      if (tag) await addTagToPerson(self.id, tag.id);
    }
  }
  await advance("interests", interests.length === 0);
}

export async function skipInterests(): Promise<void> {
  await advance("interests", true);
}

// ─────────────────────────── Passions ─────────────────────────────

export async function completePassions(formData: FormData): Promise<void> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) redirect("/login");

  const passions = parseList(formData.get("passions")).slice(0, 5);
  const self = await getOrCreateSelfPerson();
  if (self && passions.length > 0) {
    for (const name of passions) {
      await addPassion(self.id, name);
    }
  }
  await advance("passions", passions.length === 0);
}

export async function skipPassions(): Promise<void> {
  await advance("passions", true);
}

// ─────────────────────────── Orte ─────────────────────────────────

export async function completeLocations(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currentLocation =
    String(formData.get("current_location") ?? "").trim() || null;
  const homeLocation =
    String(formData.get("home_location") ?? "").trim() || null;

  const self = await getOrCreateSelfPerson();
  if (self) {
    await supabase
      .from("people")
      .update({
        current_location: currentLocation,
        home_location: homeLocation,
        updated_at: new Date().toISOString(),
      })
      .eq("id", self.id);
  }
  await advance("locations", !currentLocation && !homeLocation);
}

export async function skipLocations(): Promise<void> {
  await advance("locations", true);
}

// ─────────────────────────── Done ─────────────────────────────────

export async function completeOnboarding(): Promise<void> {
  await markStepDone("done");
  redirect("/heute");
}
