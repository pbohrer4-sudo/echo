import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/pm/workspace";
import {
  getDepartmentBySlug,
  getDepartmentMap,
} from "@/lib/pm/departments";
import {
  getLatestBriefing,
  listBoardTasks,
  listIncomingRequests,
  listOutgoingRequests,
} from "@/lib/pm/tasks";
import { listDocuments } from "@/lib/pm/documents";
import { listFolders } from "@/lib/pm/sharepoint";
import {
  BOARD_COLUMNS,
  DOC_KIND_LABEL,
  FILING_STATUS_LABEL,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/pm/types";
import type { PmTask, PmTaskPriority } from "@/lib/pm/types";
import { StatusSelect } from "../_components/status-select";
import {
  addDocument,
  confirmDocumentFiling,
  createInternalTask,
  rerunFilingSuggestion,
  updateDepartmentContext,
} from "../actions";

export const dynamic = "force-dynamic";

type Tab = "board" | "incoming" | "outgoing" | "knowledge" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "incoming", label: "Posteingang" },
  { id: "outgoing", label: "Ausgehend" },
  { id: "knowledge", label: "Wissen" },
  { id: "settings", label: "Einstellungen" },
];

const PRIORITY_COLOR: Record<PmTaskPriority, string> = {
  low: "var(--ink-4)",
  medium: "var(--action)",
  high: "var(--warn)",
  urgent: "var(--bad)",
};

function fmtHours(h: number | null): string {
  if (h == null) return "—";
  return `${h} h`;
}

function PriorityDot({ priority }: { priority: PmTaskPriority }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: PRIORITY_COLOR[priority] }}
      title={PRIORITY_LABEL[priority]}
    />
  );
}

export default async function DepartmentHub({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { tab: tabParam, error } = await searchParams;
  const tab = (TABS.find((t) => t.id === tabParam)?.id ?? "board") as Tab;

  const ws = await getOrCreateWorkspace();
  const dept = await getDepartmentBySlug(ws.id, slug);
  if (!dept) notFound();

  const deptMap = await getDepartmentMap(ws.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span
          className="h-4 w-4 rounded-full"
          style={{ backgroundColor: dept.color }}
        />
        <h1 className="text-2xl font-semibold tracking-tight">{dept.name}</h1>
        <Link
          href={`/teams/new-request?to=${dept.id}`}
          className="ml-auto rounded-lg border border-rule px-3 py-1.5 text-sm hover:border-action"
        >
          Anfrage an diese Abteilung
        </Link>
      </div>
      {dept.description && (
        <p className="-mt-3 text-sm text-ink-3">{dept.description}</p>
      )}

      <nav className="flex gap-1 border-b border-rule">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/teams/${slug}?tab=${t.id}`}
            className={`border-b-2 px-3 py-2 text-sm ${
              t.id === tab
                ? "border-action font-medium text-ink-1"
                : "border-transparent text-ink-3 hover:text-ink-1"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {error && (
        <p className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      {tab === "board" && <Board slug={slug} departmentId={dept.id} />}
      {tab === "incoming" && (
        <Incoming
          slug={slug}
          departmentId={dept.id}
          deptName={(id: string) => deptMap[id]?.name ?? "—"}
        />
      )}
      {tab === "outgoing" && (
        <Outgoing
          slug={slug}
          departmentId={dept.id}
          deptName={(id: string) => deptMap[id]?.name ?? "—"}
        />
      )}
      {tab === "knowledge" && (
        <Knowledge
          slug={slug}
          departmentId={dept.id}
          aiEnabled={ws.ai_enabled}
        />
      )}
      {tab === "settings" && (
        <Settings
          slug={slug}
          departmentId={dept.id}
          aiContext={dept.ai_context}
          description={dept.description}
          capacity={dept.sprint_capacity_hours}
        />
      )}
    </div>
  );
}

// --- Board ----------------------------------------------------------------

async function Board({
  slug,
  departmentId,
}: {
  slug: string;
  departmentId: string;
}) {
  const tasks = await listBoardTasks(departmentId);
  const byStatus = (status: string) => tasks.filter((t) => t.status === status);

  return (
    <div className="space-y-6">
      <details className="rounded-xl border border-rule bg-paper-2 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          + Neue interne Aufgabe
        </summary>
        <form action={createInternalTask} className="mt-3 grid max-w-xl gap-3">
          <input type="hidden" name="department_id" value={departmentId} />
          <input type="hidden" name="slug" value={slug} />
          <input
            name="title"
            required
            placeholder="Titel"
            className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          />
          <textarea
            name="description"
            rows={2}
            placeholder="Beschreibung (optional)"
            className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-3 gap-3">
            <input
              name="effort_estimate_hours"
              type="number"
              min="0"
              step="0.5"
              placeholder="Aufwand (h)"
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            />
            <select
              name="priority"
              defaultValue="medium"
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="low">Niedrig</option>
              <option value="medium">Mittel</option>
              <option value="high">Hoch</option>
              <option value="urgent">Dringend</option>
            </select>
            <input
              name="due_date"
              type="date"
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="justify-self-start rounded-lg bg-action px-3 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            Aufgabe anlegen
          </button>
        </form>
      </details>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {BOARD_COLUMNS.map((status) => {
          const col = byStatus(status);
          return (
            <div key={status} className="rounded-xl border border-rule bg-paper-2 p-2">
              <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-ink-3">
                <span>{TASK_STATUS_LABEL[status]}</span>
                <span className="text-ink-4">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-rule bg-paper p-2.5"
                  >
                    <Link
                      href={`/teams/${slug}/tasks/${t.id}`}
                      className="flex items-start gap-1.5 text-sm hover:text-action"
                    >
                      <PriorityDot priority={t.priority} />
                      <span className="leading-snug">{t.title}</span>
                    </Link>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-ink-4">
                        {fmtHours(t.effort_estimate_hours)}
                      </span>
                      <StatusSelect
                        taskId={t.id}
                        slug={slug}
                        current={t.status}
                      />
                    </div>
                  </div>
                ))}
                {col.length === 0 && (
                  <p className="px-1 py-3 text-center text-[11px] text-ink-5">
                    leer
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Incoming (inbox) -----------------------------------------------------

async function Incoming({
  slug,
  departmentId,
  deptName,
}: {
  slug: string;
  departmentId: string;
  deptName: (id: string) => string;
}) {
  const requests = await listIncomingRequests(departmentId);
  const briefings = await Promise.all(
    requests.map((r) => getLatestBriefing(r.id)),
  );

  if (requests.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-rule bg-paper-2 p-6 text-center text-sm text-ink-3">
        Keine eingehenden Anfragen. Andere Abteilungen können Arbeit über
        {"„Neue Anfrage“"} hier ablegen.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r, i) => {
        const b = briefings[i];
        return (
          <Link
            key={r.id}
            href={`/teams/${slug}/tasks/${r.id}`}
            className="block rounded-xl border border-rule bg-paper p-4 transition hover:border-action"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <PriorityDot priority={r.priority} />
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="mt-0.5 text-xs text-ink-4">
                    von {deptName(r.requester_department_id ?? "")} ·{" "}
                    {TASK_STATUS_LABEL[r.status]} · {fmtHours(r.effort_estimate_hours)}
                    {r.due_date ? ` · bis ${r.due_date}` : ""}
                  </p>
                </div>
              </div>
              {b ? (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                    b.status === "pending"
                      ? "bg-signal-soft text-ink-2"
                      : b.status === "accepted"
                        ? "bg-good/15 text-ink-2"
                        : "bg-paper-3 text-ink-4"
                  }`}
                >
                  {b.status === "pending"
                    ? "KI-Briefing bereit"
                    : b.status === "accepted"
                      ? "Briefing übernommen"
                      : "Briefing abgelehnt"}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-paper-3 px-2 py-0.5 text-[11px] text-ink-4">
                  kein Briefing
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// --- Outgoing -------------------------------------------------------------

async function Outgoing({
  slug,
  departmentId,
  deptName,
}: {
  slug: string;
  departmentId: string;
  deptName: (id: string) => string;
}) {
  const requests = await listOutgoingRequests(departmentId);

  if (requests.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-rule bg-paper-2 p-6 text-center text-sm text-ink-3">
        Keine ausgehenden Anfragen. Das sind Aufgaben, die andere Abteilungen
        für euch erledigen.
      </p>
    );
  }

  const open = requests.filter(
    (t) => t.status !== "done" && t.status !== "archived",
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-3">
        {open.length} offene Punkte, die andere Abteilungen für euch erledigen.
      </p>
      <div className="overflow-hidden rounded-xl border border-rule">
        <table className="w-full text-sm">
          <thead className="bg-paper-2 text-left text-xs text-ink-4">
            <tr>
              <th className="px-3 py-2 font-medium">Aufgabe</th>
              <th className="px-3 py-2 font-medium">Bei</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Aufwand</th>
              <th className="px-3 py-2 font-medium">Termin</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((t: PmTask) => (
              <tr key={t.id} className="border-t border-rule">
                <td className="px-3 py-2">
                  <Link
                    href={`/teams/${slug}/tasks/${t.id}`}
                    className="hover:text-action"
                  >
                    {t.title}
                  </Link>
                </td>
                <td className="px-3 py-2 text-ink-3">
                  {deptName(t.owner_department_id)}
                </td>
                <td className="px-3 py-2 text-ink-3">
                  {TASK_STATUS_LABEL[t.status]}
                </td>
                <td className="px-3 py-2 text-ink-3">
                  {fmtHours(t.effort_estimate_hours)}
                </td>
                <td className="px-3 py-2 text-ink-3">{t.due_date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Knowledge ------------------------------------------------------------

async function Knowledge({
  slug,
  departmentId,
  aiEnabled,
}: {
  slug: string;
  departmentId: string;
  aiEnabled: boolean;
}) {
  const [docs, folders] = await Promise.all([
    listDocuments(departmentId),
    listFolders(departmentId),
  ]);
  const folderPaths = folders.map((f) => f.path);

  return (
    <div className="space-y-5">
      <details className="rounded-xl border border-rule bg-paper-2 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          + Dokument / Transkript hinzufügen
        </summary>
        <p className="mt-2 text-xs text-ink-4">
          {aiEnabled
            ? "Beim Speichern schlägt die KI den passenden SharePoint-Ordner und einen sauberen Dateinamen vor - du bestätigst nur noch."
            : "Das Dokument wird genau so gespeichert, wie du es eingibst. (KI-Ablagevorschläge sind in den Einstellungen deaktiviert.)"}
        </p>
        <form action={addDocument} className="mt-3 grid max-w-2xl gap-3">
          <input type="hidden" name="department_id" value={departmentId} />
          <input type="hidden" name="slug" value={slug} />
          <div className="grid grid-cols-2 gap-3">
            <input
              name="title"
              required
              placeholder="Titel"
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            />
            <select
              name="kind"
              defaultValue="document"
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="document">Dokument</option>
              <option value="transcript">Transkript</option>
              <option value="note">Notiz</option>
              <option value="decision">Entscheidung</option>
            </select>
          </div>
          <input
            name="source"
            placeholder="Quelle (z.B. Teams-Call 18.06.2026)"
            className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          />
          <textarea
            name="content"
            rows={5}
            placeholder="Inhalt - fließt in die KI-Briefings dieser Abteilung ein."
            className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="justify-self-start rounded-lg bg-action px-3 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            Speichern & ablegen
          </button>
        </form>
      </details>

      {folders.length === 0 && (
        <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-ink-2">
          Noch keine SharePoint-Ordner für diese Abteilung. Die KI kann erst
          Ablageorte vorschlagen, wenn die Ordnerstruktur synchronisiert oder
          angelegt ist.
        </p>
      )}

      {docs.length === 0 ? (
        <p className="text-sm text-ink-3">
          Noch kein Wissen hinterlegt. Dokumente und Call-Transkripte hier
          zentralisieren - der KI-Agent nutzt sie für Briefings und legt sie
          in SharePoint ab.
        </p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="rounded-xl border border-rule bg-paper p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{d.title}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] text-ink-4">
                    {DOC_KIND_LABEL[d.kind]}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      d.filing_status === "confirmed"
                        ? "bg-good/15 text-ink-2"
                        : d.filing_status === "suggested"
                          ? "bg-signal-soft text-ink-2"
                          : "bg-paper-3 text-ink-4"
                    }`}
                  >
                    {FILING_STATUS_LABEL[d.filing_status]}
                  </span>
                </div>
              </div>
              {d.source && (
                <p className="mt-0.5 text-xs text-ink-4">{d.source}</p>
              )}
              {d.content && (
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-ink-3">
                  {d.content}
                </p>
              )}

              {/* Confirmed: show where it landed */}
              {d.filing_status === "confirmed" && d.confirmed_folder_path && (
                <p className="mt-2 text-xs text-ink-3">
                  Abgelegt in{" "}
                  <span className="font-mono text-ink-2">
                    {d.confirmed_folder_path}
                  </span>
                  {d.sharepoint_web_url && (
                    <>
                      {" · "}
                      <a
                        href={d.sharepoint_web_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-action hover:underline"
                      >
                        in SharePoint öffnen
                      </a>
                    </>
                  )}
                </p>
              )}

              {/* Suggested: confirm / edit the AI proposal */}
              {d.filing_status === "suggested" && (
                <div className="mt-3 rounded-lg border border-rule bg-paper-2 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-4">
                    KI-Ablagevorschlag
                  </p>
                  {d.filing_reasoning && (
                    <p className="mt-1 text-xs text-ink-3">{d.filing_reasoning}</p>
                  )}
                  <form
                    action={confirmDocumentFiling}
                    className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                  >
                    <input type="hidden" name="document_id" value={d.id} />
                    <input type="hidden" name="slug" value={slug} />
                    <label className="text-xs">
                      <span className="text-ink-4">Ordner</span>
                      <select
                        name="folder_path"
                        defaultValue={d.suggested_folder_path ?? folderPaths[0] ?? ""}
                        className="mt-1 w-full rounded-lg border border-rule bg-paper px-2 py-1.5 text-sm"
                      >
                        {folderPaths.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      <span className="text-ink-4">Dateiname</span>
                      <input
                        name="file_name"
                        defaultValue={d.suggested_name ?? d.title}
                        className="mt-1 w-full rounded-lg border border-rule bg-paper px-2 py-1.5 text-sm"
                      />
                    </label>
                    <button
                      type="submit"
                      className="h-8 rounded-lg bg-action px-3 text-xs font-medium text-paper hover:opacity-90"
                    >
                      Bestätigen & ablegen
                    </button>
                  </form>
                </div>
              )}

              {/* Unfiled: offer to (re)generate a suggestion (AI must be on) */}
              {aiEnabled &&
                d.filing_status !== "suggested" &&
                d.filing_status !== "confirmed" &&
                folders.length > 0 && (
                  <form action={rerunFilingSuggestion} className="mt-2">
                    <input type="hidden" name="document_id" value={d.id} />
                    <input type="hidden" name="slug" value={slug} />
                    <button
                      type="submit"
                      className="rounded-lg border border-rule px-2.5 py-1 text-xs font-medium hover:border-action"
                    >
                      Ablage-Vorschlag erstellen
                    </button>
                  </form>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Settings -------------------------------------------------------------

function Settings({
  slug,
  departmentId,
  aiContext,
  description,
  capacity,
}: {
  slug: string;
  departmentId: string;
  aiContext: string | null;
  description: string | null;
  capacity: number | null;
}) {
  return (
    <form action={updateDepartmentContext} className="grid max-w-2xl gap-4">
      <input type="hidden" name="department_id" value={departmentId} />
      <input type="hidden" name="slug" value={slug} />
      <label className="text-sm">
        <span className="text-ink-3">Beschreibung</span>
        <input
          name="description"
          defaultValue={description ?? ""}
          className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="text-ink-3">Sprint-Kapazität (Std. pro Sprint)</span>
        <input
          name="sprint_capacity_hours"
          type="number"
          min="0"
          step="1"
          defaultValue={capacity ?? ""}
          className="mt-1 w-40 rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="text-ink-3">
          KI-Kontext - das Wissen, mit dem der Briefing-Agent arbeitet
        </span>
        <textarea
          name="ai_context"
          rows={6}
          defaultValue={aiContext ?? ""}
          className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          placeholder="Womit arbeitet die Abteilung, wie lange dauern typische Aufgaben, welche Tools und Standards gelten?"
        />
      </label>
      <button
        type="submit"
        className="justify-self-start rounded-lg bg-action px-3 py-2 text-sm font-medium text-paper hover:opacity-90"
      >
        Speichern
      </button>
    </form>
  );
}
