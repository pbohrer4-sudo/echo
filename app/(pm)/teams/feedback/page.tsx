import { createClient } from "@/lib/supabase/server";
import { getOrCreateWorkspace } from "@/lib/pm/workspace";
import { submitFeedback } from "../actions";

export const dynamic = "force-dynamic";

interface FeedbackRow {
  id: string;
  area: string | null;
  sentiment: string | null;
  message: string;
  created_at: string;
}

const AREAS = [
  "Allgemein",
  "Board / Aufgaben",
  "Projekte",
  "Posteingang / Anfragen",
  "KI-Briefing",
  "Wissen / Ablage",
  "Benachrichtigungen",
  "Einstellungen",
];

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const ws = await getOrCreateWorkspace();

  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_feedback")
    .select("id, area, sentiment, message, created_at")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const items = (data ?? []) as FeedbackRow[];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feedback</h1>
        <p className="mt-1 text-sm text-ink-3">
          Notiere während des Tests, was gut funktioniert und was verbessert
          werden sollte. Jede Notiz landet hier gesammelt.
        </p>
      </div>

      {saved && (
        <p className="rounded-lg border border-good/40 bg-good/5 px-3 py-2 text-sm text-ink-2">
          Danke - notiert.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <form
        action={submitFeedback}
        className="grid gap-3 rounded-xl border border-rule bg-paper p-5"
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-ink-3">Bereich</span>
            <select
              name="area"
              defaultValue="Allgemein"
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-ink-3">Einschätzung</span>
            <select
              name="sentiment"
              defaultValue="verbesserung"
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="lob">Gefällt mir</option>
              <option value="verbesserung">Verbesserung</option>
              <option value="bug">Fehler / Bug</option>
              <option value="idee">Idee</option>
            </select>
          </label>
        </div>
        <label className="text-sm">
          <span className="text-ink-3">Notiz</span>
          <textarea
            name="message"
            rows={4}
            required
            placeholder="Was ist dir aufgefallen?"
            className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="justify-self-start rounded-lg bg-action px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
        >
          Feedback speichern
        </button>
      </form>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">
          Bisheriges Feedback ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-ink-3">Noch nichts notiert.</p>
        ) : (
          items.map((f) => (
            <div key={f.id} className="rounded-xl border border-rule bg-paper p-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-4">
                {f.area && (
                  <span className="rounded-full bg-paper-2 px-2 py-0.5">
                    {f.area}
                  </span>
                )}
                {f.sentiment && (
                  <span className="rounded-full bg-paper-2 px-2 py-0.5">
                    {f.sentiment}
                  </span>
                )}
                <span>{new Date(f.created_at).toLocaleString("de-DE")}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">
                {f.message}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
