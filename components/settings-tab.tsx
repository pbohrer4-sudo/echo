import { createClient } from "@/lib/supabase/server";
import { updateSettings, restartOnboarding } from "@/app/(app)/settings/actions";
import { APP_CONFIG } from "@/lib/config";

interface ProfileRow {
  display_name: string | null;
  voice_id: string | null;
  debrief_time: string | null;
  language: string | null;
  claude_key_byo: string | null;
  elevenlabs_key_byo: string | null;
}

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

// Inline Settings panel — same content as the /settings route but
// renders as a section within the self-profile tab view rather than
// as a top-level page. /settings still exists and redirects here so
// old bookmarks keep working.
//
// Reads profile state itself (rather than via props) so callers don't
// have to plumb the data — same pattern as PaymentsTab.
export async function SettingsTab({
  flash,
  selfPersonId,
}: {
  // Pass-through for ?saved=1 / ?error=... query params so the
  // updateSettings server action can show feedback after submit.
  flash?: { saved?: string; error?: string };
  // Used to compute the action's return URL via server-action +
  // redirect — passed as a hidden input the action reads.
  selfPersonId: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("profiles")
    .select(
      "display_name, voice_id, debrief_time, language, claude_key_byo, elevenlabs_key_byo",
    )
    .eq("id", user!.id)
    .maybeSingle();

  const profile = (data ?? {
    display_name: null,
    voice_id: null,
    debrief_time: null,
    language: null,
    claude_key_byo: null,
    elevenlabs_key_byo: null,
  }) as ProfileRow;

  const debriefTime = profile.debrief_time?.slice(0, 5) ?? "21:30";

  return (
    <div className="space-y-6">
      {flash?.saved && (
        <p className="rounded border border-action/30 bg-action-soft px-4 py-2 text-sm text-ink-1">
          Gespeichert.
        </p>
      )}
      {flash?.error && (
        <p className="rounded border border-bad/30 bg-bad/5 px-4 py-2 text-sm text-bad">
          Fehler: {decodeURIComponent(flash.error)}
        </p>
      )}

      <form action={updateSettings} className="space-y-10">
        {/* Tells the action where to redirect after success — keeps
            the user on the tab they were on instead of bouncing to
            /settings. */}
        <input type="hidden" name="return_to" value={`/people/${selfPersonId}?tab=settings`} />

        <Section label="Profil">
          <Field label="Anzeigename">
            <input
              name="display_name"
              defaultValue={profile.display_name ?? ""}
              placeholder="Patrick"
              className={inputClass}
            />
          </Field>
          <Field
            label="Sprache"
            hint={`Beeinflusst Voice-Erkennung und ${APP_CONFIG.PUBLIC_NAME}-Antworten`}
          >
            <select
              name="language"
              defaultValue={profile.language ?? "de"}
              className={`${inputClass} appearance-none`}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </Field>
        </Section>

        <Section label="Voice">
          <Field
            label="ElevenLabs Voice-ID"
            hint="Default: Sarah Eve (tnSpp4vdxKPjI9w0GnoV). Eigene Voice-ID aus elevenlabs.io übernehmen."
          >
            <input
              name="voice_id"
              defaultValue={profile.voice_id ?? ""}
              placeholder="tnSpp4vdxKPjI9w0GnoV"
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>
          <Field
            label="Debrief-Zeit"
            hint={`Lokal — wann ${APP_CONFIG.PUBLIC_NAME} dich abends erinnert`}
          >
            <input
              type="time"
              name="debrief_time"
              defaultValue={debriefTime}
              className={inputClass}
            />
          </Field>
        </Section>

        <Section
          label="Bring Your Own Keys"
          hint={`Optional. Wenn gesetzt, nutzt ${APP_CONFIG.PUBLIC_NAME} deinen API-Key statt des shared default. Felder leer lassen = unverändert.`}
        >
          <Field
            label="Anthropic API Key"
            hint={
              profile.claude_key_byo
                ? `Aktuell gesetzt (••••${profile.claude_key_byo.slice(-4)})`
                : "Kein eigener Key — verwendet den shared default."
            }
          >
            <input
              type="password"
              name="claude_key_byo"
              placeholder={
                profile.claude_key_byo
                  ? "Neuen Key eingeben um zu ersetzen"
                  : "sk-ant-…"
              }
              autoComplete="off"
              className={`${inputClass} font-mono text-xs`}
            />
            {profile.claude_key_byo && (
              <label className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                <input
                  type="checkbox"
                  name="clear_claude_key"
                  value="1"
                  className="accent-[oklch(32%_0.04_250)]"
                />
                Aktuellen Key entfernen
              </label>
            )}
          </Field>

          <Field
            label="ElevenLabs API Key"
            hint={
              profile.elevenlabs_key_byo
                ? `Aktuell gesetzt (••••${profile.elevenlabs_key_byo.slice(-4)})`
                : "Kein eigener Key — verwendet den shared default."
            }
          >
            <input
              type="password"
              name="elevenlabs_key_byo"
              placeholder={
                profile.elevenlabs_key_byo
                  ? "Neuen Key eingeben um zu ersetzen"
                  : "xi-…"
              }
              autoComplete="off"
              className={`${inputClass} font-mono text-xs`}
            />
            {profile.elevenlabs_key_byo && (
              <label className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                <input
                  type="checkbox"
                  name="clear_elevenlabs_key"
                  value="1"
                  className="accent-[oklch(32%_0.04_250)]"
                />
                Aktuellen Key entfernen
              </label>
            )}
          </Field>
        </Section>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
          >
            Speichern
          </button>
        </div>
      </form>

      <Section
        label="Onboarding"
        hint="Du kannst den Einrichtungs-Assistenten jederzeit erneut durchlaufen — alle Daten bleiben erhalten, nur die Wizard-Schritte werden wieder gezeigt."
      >
        <form action={restartOnboarding}>
          <button
            type="submit"
            className="rounded border border-rule bg-paper px-4 py-2 text-sm text-ink-2 transition hover:border-action hover:text-action"
          >
            Onboarding erneut starten
          </button>
        </form>
      </Section>
    </div>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="section-head">
        <span className="t-label">{label}</span>
        <span className="rule" />
      </div>
      {hint && <p className="text-xs text-ink-4">{hint}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="t-label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-4">{hint}</span>}
    </label>
  );
}
