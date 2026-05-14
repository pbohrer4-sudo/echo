import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveOrCreateOrganization } from "@/lib/organizations";
import type {
  AddressEntry,
  EmailEntry,
  ImportantDate,
  PhoneEntry,
  SocialEntry,
} from "@/lib/types";
import type { VCardContact } from "@/lib/vcard";

export const runtime = "nodejs";
export const maxDuration = 60;

// Per Row: action steuert was passieren soll. Default für non-match
// ist "create"; bei UI-Confirmation kann der User pro Zeile auf
// "merge" wechseln (oder "skip").
type ImportAction = "create" | "merge" | "skip";

interface CommitRow extends VCardContact {
  action: ImportAction;
  merge_into_id?: string;
}

interface CommitRequest {
  rows: CommitRow[];
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CommitRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "no rows" }, { status: 400 });
  }

  let inserted = 0;
  let merged = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    if (row.action === "skip") {
      skipped += 1;
      continue;
    }

    if (row.action === "merge" && row.merge_into_id) {
      try {
        const result = await mergeIntoExisting(supabase, user.id, row);
        if (result.ok) merged += 1;
        else errors.push(`${name}: ${result.error}`);
      } catch (err) {
        errors.push(
          `${name}: ${err instanceof Error ? err.message : "merge error"}`,
        );
      }
      continue;
    }

    // Default: neu anlegen.
    const organization_id = await resolveOrCreateOrganization(
      row.company,
      user.id,
    );

    const important_dates: ImportantDate[] = row.birthday
      ? [{ label: "Geburtstag", date: row.birthday, remind: true }]
      : [];

    const { data: insertedPerson, error } = await supabase
      .from("people")
      .insert({
        user_id: user.id,
        name,
        company: row.company,
        role: row.role,
        phones: row.phones,
        emails: row.emails,
        addresses: row.addresses,
        socials: row.socials,
        important_dates,
        relationships: [],
        notes: row.notes,
        organization_id,
        purpose: "personal" as const,
      })
      .select("id")
      .single();

    if (error || !insertedPerson) {
      errors.push(`${name}: ${error?.message ?? "insert failed"}`);
      continue;
    }

    await syncContactsToV3({
      supabase,
      userId: user.id,
      personId: insertedPerson.id,
      phones: row.phones,
      emails: row.emails,
      socials: row.socials,
    });
    inserted += 1;
  }

  revalidatePath("/people");

  const status =
    inserted === 0 && merged === 0 && errors.length > 0 ? 500 : 200;
  return NextResponse.json(
    { inserted, merged, skipped, errors },
    { status },
  );
}

// ──────────────────────── Merge ────────────────────────

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

interface MergeResult {
  ok: boolean;
  error?: string;
}

async function mergeIntoExisting(
  supabase: SupabaseLike,
  userId: string,
  row: CommitRow,
): Promise<MergeResult> {
  if (!row.merge_into_id) return { ok: false, error: "merge_into_id fehlt" };

  const [personRes, contactsRes] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, company, role, notes, phones, emails, addresses, socials, important_dates, organization_id",
      )
      .eq("id", row.merge_into_id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("person_contacts")
      .select("channel, value")
      .eq("user_id", userId)
      .eq("person_id", row.merge_into_id),
  ]);

  if (personRes.error || !personRes.data) {
    return {
      ok: false,
      error: personRes.error?.message ?? "Person nicht gefunden",
    };
  }

  const existing = personRes.data as {
    id: string;
    company: string | null;
    role: string | null;
    notes: string | null;
    phones: PhoneEntry[] | null;
    emails: EmailEntry[] | null;
    addresses: AddressEntry[] | null;
    socials: SocialEntry[] | null;
    important_dates: ImportantDate[] | null;
    organization_id: string | null;
  };

  const existingPhones = new Set(
    (existing.phones ?? [])
      .map((p) => normalizePhone(p.value))
      .filter(Boolean),
  );
  const existingEmails = new Set(
    (existing.emails ?? [])
      .map((e) => e.value.trim().toLowerCase())
      .filter(Boolean),
  );
  const existingSocials = new Set(
    (existing.socials ?? []).map(
      (s) =>
        `${s.platform.toLowerCase()}::${s.handle_or_url.trim().toLowerCase()}`,
    ),
  );

  const existingContactKeys = new Set<string>();
  for (const c of (contactsRes.data ?? []) as {
    channel: string;
    value: string;
  }[]) {
    existingContactKeys.add(`${c.channel}::${c.value.trim().toLowerCase()}`);
  }

  const newPhones: PhoneEntry[] = [];
  for (const p of row.phones) {
    const digits = normalizePhone(p.value);
    if (!digits || existingPhones.has(digits)) continue;
    newPhones.push(p);
    existingPhones.add(digits);
  }

  const newEmails: EmailEntry[] = [];
  for (const e of row.emails) {
    const lower = e.value.trim().toLowerCase();
    if (!lower || existingEmails.has(lower)) continue;
    newEmails.push(e);
    existingEmails.add(lower);
  }

  const newSocials: SocialEntry[] = [];
  for (const s of row.socials) {
    const key = `${s.platform.toLowerCase()}::${s.handle_or_url.trim().toLowerCase()}`;
    if (existingSocials.has(key)) continue;
    newSocials.push(s);
    existingSocials.add(key);
  }

  const existingDates = (existing.important_dates ?? []) as ImportantDate[];
  const hasBirthday = existingDates.some(
    (d) =>
      d.label.toLowerCase().includes("geburt") && d.date === row.birthday,
  );
  const datePatch =
    row.birthday && !hasBirthday
      ? [
          ...existingDates,
          { label: "Geburtstag", date: row.birthday, remind: true },
        ]
      : existingDates;

  let organizationUpdate: string | null | undefined;
  if (row.company && !existing.company) {
    organizationUpdate = await resolveOrCreateOrganization(row.company, userId);
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (newPhones.length > 0)
    update.phones = [...(existing.phones ?? []), ...newPhones];
  if (newEmails.length > 0)
    update.emails = [...(existing.emails ?? []), ...newEmails];
  if (newSocials.length > 0)
    update.socials = [...(existing.socials ?? []), ...newSocials];
  if (row.addresses.length > 0)
    update.addresses = [...(existing.addresses ?? []), ...row.addresses];
  if (datePatch !== existingDates) update.important_dates = datePatch;
  if (!existing.company && row.company) update.company = row.company;
  if (!existing.role && row.role) update.role = row.role;
  if (!existing.notes && row.notes) update.notes = row.notes;
  if (organizationUpdate !== undefined)
    update.organization_id = organizationUpdate;

  if (Object.keys(update).length > 1) {
    const { error } = await supabase
      .from("people")
      .update(update)
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
  }

  // V3-Sync: nur neue Channels in person_contacts.
  const v3Inserts: Record<string, unknown>[] = [];
  for (const p of row.phones) {
    const value = p.value.trim();
    const key = `phone::${value.toLowerCase()}`;
    if (!value || existingContactKeys.has(key)) continue;
    v3Inserts.push({
      user_id: userId,
      person_id: existing.id,
      channel: "phone",
      subtype: p.label || null,
      value,
      source: "vcard_import",
    });
    existingContactKeys.add(key);
  }
  for (const e of row.emails) {
    const value = e.value.trim();
    const key = `email::${value.toLowerCase()}`;
    if (!value || existingContactKeys.has(key)) continue;
    v3Inserts.push({
      user_id: userId,
      person_id: existing.id,
      channel: "email",
      subtype: e.label || null,
      value,
      source: "vcard_import",
    });
    existingContactKeys.add(key);
  }
  for (const s of row.socials) {
    const value = s.handle_or_url.trim();
    const channel = socialPlatformToChannel(s.platform);
    const key = `${channel}::${value.toLowerCase()}`;
    if (!value || existingContactKeys.has(key)) continue;
    v3Inserts.push({
      user_id: userId,
      person_id: existing.id,
      channel,
      value,
      source: "vcard_import",
    });
    existingContactKeys.add(key);
  }
  if (v3Inserts.length > 0) {
    await supabase.from("person_contacts").insert(v3Inserts);
  }

  return { ok: true };
}

// ──────────────────────── V3-Sync nach Insert ──────────────

async function syncContactsToV3(args: {
  supabase: SupabaseLike;
  userId: string;
  personId: string;
  phones: PhoneEntry[];
  emails: EmailEntry[];
  socials: SocialEntry[];
}): Promise<void> {
  const rows: Record<string, unknown>[] = [];
  let phoneIdx = 0;
  for (const p of args.phones) {
    const value = p.value.trim();
    if (!value) continue;
    rows.push({
      user_id: args.userId,
      person_id: args.personId,
      channel: "phone",
      subtype: p.label || null,
      value,
      is_primary: phoneIdx === 0,
      source: "vcard_import",
    });
    phoneIdx += 1;
  }
  let emailIdx = 0;
  for (const e of args.emails) {
    const value = e.value.trim();
    if (!value) continue;
    rows.push({
      user_id: args.userId,
      person_id: args.personId,
      channel: "email",
      subtype: e.label || null,
      value,
      is_primary: emailIdx === 0,
      source: "vcard_import",
    });
    emailIdx += 1;
  }
  for (const s of args.socials) {
    const value = s.handle_or_url.trim();
    if (!value) continue;
    rows.push({
      user_id: args.userId,
      person_id: args.personId,
      channel: socialPlatformToChannel(s.platform),
      value,
      source: "vcard_import",
    });
  }
  if (rows.length === 0) return;
  const { error } = await args.supabase.from("person_contacts").insert(rows);
  if (error) {
    console.error("[vcard-commit] V3 sync failed", error.message);
  }
}

function socialPlatformToChannel(platform: string): string {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("linkedin")) return "linkedin";
  if (p.includes("instagram")) return "instagram";
  if (p.includes("twitter") || p === "x") return "twitter";
  if (p.includes("github")) return "github";
  if (p.includes("mastodon")) return "mastodon";
  if (p.includes("bluesky")) return "bluesky";
  if (p.includes("threads")) return "threads";
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("telegram")) return "telegram";
  if (p.includes("signal")) return "signal";
  if (p.includes("website")) return "website";
  return "other";
}
