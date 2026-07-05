import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/pm/workspace";
import {
  getOrCreatePersonalSpace,
  listDepartments,
} from "@/lib/pm/departments";
import { countOpenIncoming, listOutgoingRequests } from "@/lib/pm/tasks";
import { isActiveStatus } from "@/lib/pm/types";
import { createDepartment, seedDemo } from "./actions";

export const dynamic = "force-dynamic";

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ws = await getOrCreateWorkspace();
  // Every user gets a private Personal Space, like in Wrike.
  const personal = await getOrCreatePersonalSpace(ws.id);
  const departments = (await listDepartments(ws.id)).filter(
    (d) => !d.personal_owner_id,
  );

  // Per-department open-inbox counts (work other teams asked them to do).
  const counts = await Promise.all(
    departments.map(async (d) => ({
      id: d.id,
      incoming: await countOpenIncoming(d.id),
      outgoing: (await listOutgoingRequests(d.id)).filter(
        (t) => isActiveStatus(t.status),
      ).length,
    })),
  );
  const countMap = Object.fromEntries(counts.map((c) => [c.id, c]));

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Abteilungen</h1>
          <p className="mt-1 text-sm text-ink-3">
            Jede Abteilung hat einen eigenen Hub: Aufgaben, Wissen, ein- und
            ausgehende Anfragen.
          </p>
        </div>
        <Link
          href="/teams/new-request"
          className="rounded-lg bg-action px-3 py-2 text-sm font-medium text-paper hover:opacity-90"
        >
          + Anfrage an andere Abteilung
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      {personal && (
        <Link
          href={`/teams/${personal.slug}`}
          className="group flex items-center justify-between rounded-xl border border-rule bg-paper-2 p-4 transition hover:border-action"
        >
          <span className="flex items-center gap-2 text-sm">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: personal.color }}
            />
            <span className="font-medium group-hover:text-action">
              🔒 Persönlich
            </span>
            <span className="text-ink-4">
              Dein privater Bereich - nur für dich sichtbar.
            </span>
          </span>
        </Link>
      )}

      {departments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule bg-paper-2 p-8 text-center">
          <p className="text-sm text-ink-3">
            Noch keine Abteilungen. Lege deine erste an - oder starte mit
            Beispieldaten, um den Ablauf zu sehen.
          </p>
          <form action={seedDemo} className="mt-4">
            <button
              type="submit"
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm font-medium hover:border-action"
            >
              Beispieldaten laden (Marketing, Sales, Produkt)
            </button>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d) => {
            const c = countMap[d.id];
            return (
              <Link
                key={d.id}
                href={`/teams/${d.slug}`}
                className="group rounded-xl border border-rule bg-paper p-5 transition hover:border-action hover:shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  <h2 className="font-medium group-hover:text-action">{d.name}</h2>
                </div>
                {d.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-ink-3">
                    {d.description}
                  </p>
                )}
                <div className="mt-4 flex gap-4 text-xs text-ink-4">
                  <span>
                    <strong className="text-ink-2">{c?.incoming ?? 0}</strong> offene
                    Anfragen
                  </span>
                  <span>
                    <strong className="text-ink-2">{c?.outgoing ?? 0}</strong> ausgehend
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <details className="rounded-xl border border-rule bg-paper-2 p-5">
        <summary className="cursor-pointer text-sm font-medium">
          + Neue Abteilung anlegen
        </summary>
        <form action={createDepartment} className="mt-4 grid max-w-xl gap-3">
          <label className="text-sm">
            <span className="text-ink-3">Name</span>
            <input
              name="name"
              required
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
              placeholder="z.B. Marketing"
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-3">Beschreibung</span>
            <input
              name="description"
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
              placeholder="Wofür ist die Abteilung zuständig?"
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-3">Farbe</span>
            <input
              name="color"
              type="color"
              defaultValue="#6b665d"
              className="mt-1 block h-9 w-16 rounded border border-rule bg-paper"
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-3">
              KI-Kontext (Wissen für den Briefing-Agenten)
            </span>
            <textarea
              name="ai_context"
              rows={3}
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
              placeholder="Womit arbeitet die Abteilung, wie lange dauern typische Aufgaben, welche Tools, welche Standards?"
            />
          </label>
          <button
            type="submit"
            className="justify-self-start rounded-lg bg-action px-3 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            Abteilung anlegen
          </button>
        </form>
      </details>
    </div>
  );
}
