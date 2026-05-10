import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/user-context";
import {
  getGoogleAccess,
  matchPersonByEmail,
  type SupabaseScope,
} from "@/lib/google";
import { getConnectionByProvider } from "@/lib/connections";
import type { ServiceConnection } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Google Calendar sync. Pulls events from the user's primary calendar
// for the last 7 days + next 30 days, ingests each into
// external_events, matches attendees to known people, and writes a
// matching row in interactions for each match (so events show up
// alongside voice-logged interactions on a person's timeline).
//
// Callable from two contexts:
//   - API route (user session) — call syncGoogleCalendar() with no args
//   - Cron (admin client, looping users) — call runCalendarSync(scope, conn)
//
// We use a sliding window rather than nextSyncToken-based incremental
// sync because the user-facing window is small and the simpler code
// is worth the few extra API calls.

const PRIMARY_CALENDAR = "primary";
const WINDOW_BACK_DAYS = 7;
const WINDOW_FWD_DAYS = 30;

interface GCalAttendee {
  email?: string;
  displayName?: string;
  responseStatus?: string;
  organizer?: boolean;
  self?: boolean;
}

interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: GCalAttendee[];
  organizer?: { email?: string };
  status?: string;
}

export interface CalendarSyncResult {
  ok: boolean;
  pulled: number;
  ingested: number;
  matched_to_people: number;
  interactions_created: number;
  error?: string;
}

// Session-context entry point used by /api/calendar/sync.
export async function syncGoogleCalendar(): Promise<CalendarSyncResult> {
  const ctx = await getUserContext();
  if (!ctx) return zeroResult({ ok: false, error: "unauthorized" });

  const conn = await getConnectionByProvider("google_calendar");
  if (!conn || conn.status !== "connected") {
    return zeroResult({ ok: false, error: "not connected" });
  }

  const supabase = await createClient();
  return runCalendarSync({ supabase, userId: ctx.user_id }, conn);
}

// Explicit-context entry point used by cron. The caller resolves the
// user + supabase client; this function only owns the upstream API
// work + DB writes.
export async function runCalendarSync(
  scope: SupabaseScope,
  conn: ServiceConnection,
): Promise<CalendarSyncResult> {
  let auth;
  try {
    auth = await getGoogleAccess(conn, scope);
  } catch (err) {
    return zeroResult({
      ok: false,
      error: err instanceof Error ? err.message : "auth failed",
    });
  }

  const timeMin = new Date(
    Date.now() - WINDOW_BACK_DAYS * 86400_000,
  ).toISOString();
  const timeMax = new Date(
    Date.now() + WINDOW_FWD_DAYS * 86400_000,
  ).toISOString();

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(PRIMARY_CALENDAR)}/events`,
  );
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "100");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return zeroResult({
      ok: false,
      error: `Calendar API ${res.status}: ${text.slice(0, 200)}`,
    });
  }
  const payload = (await res.json()) as { items?: GCalEvent[] };
  const events = payload.items ?? [];

  const supabase: SupabaseClient = scope.supabase;
  let ingested = 0;
  let matched = 0;
  let interactions = 0;

  for (const ev of events) {
    if (!ev.start) continue;
    const startsAt = ev.start.dateTime ?? ev.start.date;
    if (!startsAt) continue;
    const endsAt = ev.end?.dateTime ?? ev.end?.date ?? null;

    const attendeeRows = (ev.attendees ?? [])
      .filter((a) => !a.self && a.email)
      .map((a) => ({ email: a.email!, name: a.displayName ?? null }));

    const matches = await Promise.all(
      attendeeRows.map((a) => matchPersonByEmail(a.email, scope)),
    );
    const matchedIds = matches.filter((m): m is string => m !== null);
    if (matchedIds.length > 0) matched += matchedIds.length;

    const { data: upserted, error: upsertErr } = await supabase
      .from("external_events")
      .upsert(
        {
          user_id: scope.userId,
          provider: "google_calendar",
          external_id: ev.id,
          calendar_id: PRIMARY_CALENDAR,
          title: ev.summary ?? null,
          description: ev.description ?? null,
          location: ev.location ?? null,
          starts_at: startsAt,
          ends_at: endsAt,
          attendees: attendeeRows,
          organizer_email: ev.organizer?.email ?? null,
          status: ev.status ?? "confirmed",
          raw: ev as unknown as Record<string, unknown>,
          matched_person_ids: matchedIds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider,external_id" },
      )
      .select("id, interaction_id")
      .maybeSingle();
    if (upsertErr) {
      console.error("[calendar-sync] upsert failed", upsertErr.message);
      continue;
    }
    ingested += 1;

    const isPast = new Date(startsAt).getTime() < Date.now();
    if (isPast && upserted && !upserted.interaction_id) {
      for (const personId of matchedIds) {
        const { data: ins } = await supabase
          .from("interactions")
          .insert({
            user_id: scope.userId,
            person_id: personId,
            type: "meeting",
            source: "calendar",
            occurred_at: startsAt,
            summary: ev.summary ?? "Meeting",
          })
          .select("id")
          .maybeSingle();
        if (ins?.id) {
          interactions += 1;
          await supabase
            .from("external_events")
            .update({ interaction_id: ins.id })
            .eq("id", upserted.id);
        }
      }
    }
  }

  await supabase
    .from("service_connections")
    .update({
      last_used_at: new Date().toISOString(),
      config: {
        ...(conn.config as Record<string, unknown>),
        last_sync_at: new Date().toISOString(),
        last_sync_pulled: events.length,
        last_sync_ingested: ingested,
      },
    })
    .eq("id", conn.id);

  return {
    ok: true,
    pulled: events.length,
    ingested,
    matched_to_people: matched,
    interactions_created: interactions,
  };
}

function zeroResult(extra: Partial<CalendarSyncResult>): CalendarSyncResult {
  return {
    ok: false,
    pulled: 0,
    ingested: 0,
    matched_to_people: 0,
    interactions_created: 0,
    ...extra,
  };
}
