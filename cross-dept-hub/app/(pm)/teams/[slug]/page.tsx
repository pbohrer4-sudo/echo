import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/pm/workspace";
import {
  getDepartmentBySlug,
  getDepartmentMap,
  listDepartmentMembers,
} from "@/lib/pm/departments";
import { listBookmarks } from "@/lib/pm/bookmarks";
import {
  getLatestBriefing,
  listBoardTasks,
  listIncomingRequests,
  listOutgoingRequests,
} from "@/lib/pm/tasks";
import { listDocuments } from "@/lib/pm/documents";
import { listProjects } from "@/lib/pm/projects";
import { listFolders } from "@/lib/pm/sharepoint";
import {
  listCrossTaggedTasks,
  listFoldersForDepartment,
  listItemTypes,
} from "@/lib/pm/structure";
import { listBlueprints } from "@/lib/pm/automations";
import { departmentWorkload, loggedHoursByTask } from "@/lib/pm/workload";
import { listWorkspaceMembers } from "@/lib/pm/workspace";
import {
  AI_MODE_LABEL,
  BOARD_COLUMNS,
  DOC_KIND_LABEL,
  FILING_STATUS_LABEL,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  VIEW_LABEL,
} from "@/lib/pm/types";
import type {
  PmProject,
  PmTask,
  PmTaskPriority,
  PmView,
} from "@/lib/pm/types";
import { StatusSelect } from "../_components/status-select";
import { AiModeSelect } from "../_components/ai-mode-select";
import { ListView } from "./_views/list-view";
import { GanttView } from "./_views/gantt-view";
import { CalendarView } from "./_views/calendar-view";
import { WorkloadView } from "./_views/workload-view";
import {
  addBookmark,
  addDepartmentMember,
  addDocument,
  archiveFolder,
  confirmDocumentFiling,
  createFolder,
  createInternalTask,
  createProject,
  deleteBookmark,
  removeDepartmentMember,
  rerunFilingSuggestion,
  updateDepartmentContext,
  updateProjectAiMode,
} from "../actions";

export const dynamic = "force-dynamic";

type Tab =
  | "board"
  | "projects"
  | "incoming"
  | "outgoing"
  | "workload"
  | "knowledge"
  | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "board", label: "Arbeit" },
  { id: "projects", label: "Projekte & Ordner" },
  { id: "incoming", label: "Posteingang" },
  { id: "outgoing", label: "Ausgehend" },
  { id: "workload", label: "Auslastung" },
  { id: "knowledge", label: "Wissen" },
  { id: "settings", label: "Einstellungen" },
];

const VIEWS: PmView[] = ["board", "list", "gantt", "calendar"];

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
  searchParams: Promise<{
    tab?: string;
    error?: string;
    view?: string;
    month?: string;
  }>;
}) {
  const { slug } = await params;
  const { tab: tabParam, error, view: viewParam, month } = await searchParams;
  const tab = (TABS.find((t) => t.id === tabParam)?.id ?? "board") as Tab;
  const view = (VIEWS.includes(viewParam as PmView) ? viewParam : "board") as PmView;

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

      <BookmarksBar slug={slug} departmentId={dept.id} />

      {tab === "board" && (
        <WorkArea
          slug={slug}
          departmentId={dept.id}
          workspaceId={ws.id}
          view={view}
          month={month}
        />
      )}
      {tab === "projects" && <Projects slug={slug} departmentId={dept.id} />}
      {tab === "workload" && (
        <Workload
          workspaceId={ws.id}
          departmentId={dept.id}
          capacity={dept.sprint_capacity_hours}
        />
      )}
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

// --- Bookmarks (Wrike: quick links pinned to a space) -----------------------

async function BookmarksBar({
  slug,
  departmentId,
}: {
  slug: string;
  departmentId: string;
}) {
  const bookmarks = await listBookmarks(departmentId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {bookmarks.map((b) => (
        <span
          key={b.id}
          className="group inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper px-3 py-1 text-xs"
        >
          <a
            href={b.url}
            target="_blank"
            rel="noreferrer"
            className="text-ink-2 hover:text-action"
            title={b.section ? `${b.section}: ${b.url}` : b.url}
          >
            🔖 {b.title}
          </a>
          <form action={deleteBookmark} className="hidden group-hover:block">
            <input type="hidden" name="bookmark_id" value={b.id} />
            <input type="hidden" name="slug" value={slug} />
            <button type="submit" className="text-ink-4 hover:text-bad" title="Entfernen">
              ×
            </button>
          </form>
        </span>
      ))}
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-full border border-dashed border-rule px-3 py-1 text-xs text-ink-3 hover:border-action hover:text-ink-1">
          + Lesezeichen
        </summary>
        <form
          action={addBookmark}
          className="absolute left-0 z-30 mt-2 grid w-72 gap-2 rounded-xl border border-rule bg-paper p-3 shadow-lg"
        >
          <input type="hidden" name="department_id" value={departmentId} />
          <input type="hidden" name="slug" value={slug} />
          <input
            name="title"
            required
            placeholder="Titel"
            className="rounded-lg border border-rule bg-paper px-2 py-1.5 text-xs"
          />
          <input
            name="url"
            required
            type="url"
            placeholder="https://…"
            className="rounded-lg border border-rule bg-paper px-2 py-1.5 text-xs"
          />
          <input
            name="section"
            placeholder="Bereich (optional)"
            className="rounded-lg border border-rule bg-paper px-2 py-1.5 text-xs"
          />
          <button
            type="submit"
            className="justify-self-start rounded-lg bg-action px-2.5 py-1.5 text-xs font-medium text-paper hover:opacity-90"
          >
            Hinzufügen
          </button>
        </form>
      </details>
    </div>
  );
}

// --- Work area (Board / Liste / Gantt / Kalender) ---------------------------

async function WorkArea({
  slug,
  departmentId,
  workspaceId,
  view,
  month,
}: {
  slug: string;
  departmentId: string;
  workspaceId: string;
  view: PmView;
  month?: string;
}) {
  const [ownTasks, crossTagged, projects, folders, itemTypes, members, blueprints] =
    await Promise.all([
      listBoardTasks(departmentId),
      listCrossTaggedTasks(departmentId),
      listProjects(departmentId),
      listFoldersForDepartment(departmentId),
      listItemTypes(workspaceId),
      listWorkspaceMembers(workspaceId),
      listBlueprints(workspaceId),
    ]);

  // Cross-tagged tasks appear alongside the department's own (Wrike
  // cross-tagging: same row, several locations). Subtasks stay on the
  // parent's detail page instead of cluttering the board.
  const seen = new Set(ownTasks.map((t) => t.id));
  const tasks = [
    ...ownTasks,
    ...crossTagged.filter((t) => !seen.has(t.id)),
  ].filter((t) => !t.parent_task_id);
  const crossTaggedIds = new Set(crossTagged.map((t) => t.id));

  const loggedHours = await loggedHoursByTask(tasks.map((t) => t.id));
  const assigneeNames: Record<string, string> = {};
  for (const m of members) {
    assigneeNames[m.user_id] = m.display_name || m.user_id.slice(0, 8);
  }
  const projectName = (id: string | null) =>
    id ? projects.find((p) => p.id === id)?.name ?? null : null;
  const byStatus = (status: string) => tasks.filter((t) => t.status === status);

  return (
    <div className="space-y-6">
      {/* View switcher — same data, four layouts. */}
      <div className="flex flex-wrap items-center gap-1">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={`/teams/${slug}?tab=board&view=${v}`}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              v === view
                ? "bg-action font-medium text-paper"
                : "border border-rule text-ink-3 hover:border-action hover:text-ink-1"
            }`}
          >
            {VIEW_LABEL[v]}
          </Link>
        ))}
        <a
          href={`/api/pm/reports/tasks?department=${departmentId}`}
          className="ml-auto rounded-lg border border-rule px-3 py-1.5 text-sm text-ink-3 hover:border-action hover:text-ink-1"
        >
          CSV-Report ↓
        </a>
      </div>

      <details className="rounded-xl border border-rule bg-paper-2 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          + Neue interne Aufgabe
        </summary>
        <form action={createInternalTask} className="mt-3 grid max-w-xl gap-3">
          <input type="hidden" name="department_id" value={departmentId} />
          <input type="hidden" name="slug" value={slug} />
          {blueprints.length > 0 && (
            <label className="text-sm">
              <span className="text-ink-3">
                Vorlage (optional - füllt Felder und Unteraufgaben vor)
              </span>
              <select
                name="blueprint_id"
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
              >
                <option value="">Keine Vorlage</option>
                {blueprints.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            name="title"
            placeholder="Titel (bei Vorlage optional)"
            className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          />
          <textarea
            name="description"
            rows={2}
            placeholder="Beschreibung (optional)"
            className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              name="project_id"
              defaultValue=""
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="">Kein Projekt</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              name="folder_id"
              defaultValue=""
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="">Kein Ordner</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select
              name="item_type_id"
              defaultValue=""
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="">Typ: Aufgabe</option>
              {itemTypes.map((it) => (
                <option key={it.id} value={it.id}>
                  Typ: {it.icon} {it.name}
                </option>
              ))}
            </select>
            <select
              name="assignee_id"
              defaultValue=""
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="">Nicht zugewiesen</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name || m.user_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-ink-4">
              Start
              <input
                name="start_date"
                type="date"
                className="mt-0.5 block w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink-1"
              />
            </label>
            <label className="text-xs text-ink-4">
              Fällig
              <input
                name="due_date"
                type="date"
                className="mt-0.5 block w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink-1"
              />
            </label>
          </div>
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
            <select
              name="ai_mode"
              defaultValue="inherit"
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="inherit">KI: Erbt</option>
              <option value="on">KI: An</option>
              <option value="off">KI: Aus</option>
            </select>
          </div>
          <button
            type="submit"
            className="justify-self-start rounded-lg bg-action px-3 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            Aufgabe anlegen
          </button>
        </form>
      </details>

      {view === "list" && (
        <ListView
          slug={slug}
          tasks={tasks}
          folders={folders}
          itemTypes={itemTypes}
          loggedHours={loggedHours}
          assigneeNames={assigneeNames}
        />
      )}
      {view === "gantt" && <GanttView slug={slug} tasks={tasks} />}
      {view === "calendar" && (
        <CalendarView slug={slug} tasks={tasks} month={month} tab="board" />
      )}
      {view === "board" && (
        <BoardColumns
          slug={slug}
          byStatus={byStatus}
          projectName={projectName}
          crossTaggedIds={crossTaggedIds}
        />
      )}
    </div>
  );
}

function BoardColumns({
  slug,
  byStatus,
  projectName,
  crossTaggedIds,
}: {
  slug: string;
  byStatus: (status: string) => PmTask[];
  projectName: (id: string | null) => string | null;
  crossTaggedIds: Set<string>;
}) {
  return (
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
                    {(projectName(t.project_id) || t.ai_mode !== "inherit") && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {projectName(t.project_id) && (
                          <span className="rounded bg-paper-2 px-1.5 py-0.5 text-[10px] text-ink-3">
                            {projectName(t.project_id)}
                          </span>
                        )}
                        {t.ai_mode !== "inherit" && (
                          <span className="rounded bg-paper-2 px-1.5 py-0.5 text-[10px] text-ink-3">
                            KI: {AI_MODE_LABEL[t.ai_mode]}
                          </span>
                        )}
                      </div>
                    )}
                    {crossTaggedIds.has(t.id) && (
                      <span className="mt-1.5 inline-block rounded bg-signal-soft px-1.5 py-0.5 text-[10px] text-ink-3">
                        ⇄ Cross-Tag
                      </span>
                    )}
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
  );
}

// --- Projects -------------------------------------------------------------

async function Projects({
  slug,
  departmentId,
}: {
  slug: string;
  departmentId: string;
}) {
  const projects = await listProjects(departmentId);

  return (
    <div className="space-y-5">
      <details className="rounded-xl border border-rule bg-paper-2 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          + Neues Projekt
        </summary>
        <p className="mt-2 text-xs text-ink-4">
          Ein Projekt bündelt Aufgaben. Der KI-Modus eines Projekts gilt für
          alle seine Aufgaben - sofern die Aufgabe nicht selbst An oder Aus
          setzt.
        </p>
        <form action={createProject} className="mt-3 grid max-w-xl gap-3">
          <input type="hidden" name="department_id" value={departmentId} />
          <input type="hidden" name="slug" value={slug} />
          <input
            name="name"
            required
            placeholder="Projektname"
            className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          />
          <textarea
            name="description"
            rows={2}
            placeholder="Beschreibung (optional)"
            className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          />
          <label className="text-sm">
            <span className="text-ink-3">KI-Modus</span>
            <select
              name="ai_mode"
              defaultValue="inherit"
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="inherit">Erbt vom Workspace</option>
              <option value="on">An</option>
              <option value="off">Aus (alles bleibt wie eingegeben)</option>
            </select>
          </label>
          <button
            type="submit"
            className="justify-self-start rounded-lg bg-action px-3 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            Projekt anlegen
          </button>
        </form>
      </details>

      {projects.length === 0 ? (
        <p className="text-sm text-ink-3">
          Noch keine Projekte. Lege eines an, um Aufgaben zu bündeln und den
          KI-Modus projektweit zu steuern.
        </p>
      ) : (
        <div className="space-y-2">
          {projects.map((p: PmProject) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-rule bg-paper p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
                {p.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-ink-3">
                    {p.description}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                <AiModeSelect
                  action={updateProjectAiMode}
                  idName="project_id"
                  idValue={p.id}
                  slug={slug}
                  current={p.ai_mode}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <FoldersSection slug={slug} departmentId={departmentId} />
    </div>
  );
}

// Folders group tasks without a deadline (Wrike hierarchy: space → folder →
// task). Nesting one level via parent folder.
async function FoldersSection({
  slug,
  departmentId,
}: {
  slug: string;
  departmentId: string;
}) {
  const folders = await listFoldersForDepartment(departmentId);
  const children = new Map<string, typeof folders>();
  const roots = folders.filter((f) => {
    if (!f.parent_folder_id) return true;
    children.set(f.parent_folder_id, [
      ...(children.get(f.parent_folder_id) ?? []),
      f,
    ]);
    return false;
  });

  return (
    <div className="space-y-3 border-t border-rule pt-5">
      <h2 className="text-sm font-semibold">Ordner</h2>
      <p className="text-xs text-ink-4">
        Ordner gruppieren Aufgaben ohne festes Enddatum. In der Listen-Ansicht
        werden Aufgaben nach Ordner gruppiert.
      </p>

      <details className="rounded-xl border border-rule bg-paper-2 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          + Neuer Ordner
        </summary>
        <form action={createFolder} className="mt-3 grid max-w-xl gap-3">
          <input type="hidden" name="department_id" value={departmentId} />
          <input type="hidden" name="slug" value={slug} />
          <input
            name="name"
            required
            placeholder="Ordnername"
            className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          />
          <select
            name="parent_folder_id"
            defaultValue=""
            className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          >
            <option value="">Oberste Ebene</option>
            {roots.map((f) => (
              <option key={f.id} value={f.id}>
                In: {f.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="justify-self-start rounded-lg bg-action px-3 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            Ordner anlegen
          </button>
        </form>
      </details>

      {roots.length === 0 ? (
        <p className="text-sm text-ink-3">Noch keine Ordner.</p>
      ) : (
        <ul className="space-y-1.5">
          {roots.map((f) => (
            <li key={f.id}>
              <FolderRow slug={slug} folder={f} depth={0} />
              {(children.get(f.id) ?? []).map((c) => (
                <FolderRow key={c.id} slug={slug} folder={c} depth={1} />
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FolderRow({
  slug,
  folder,
  depth,
}: {
  slug: string;
  folder: { id: string; name: string; description: string | null };
  depth: number;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-lg border border-rule bg-paper px-3 py-2"
      style={{ marginLeft: depth * 24 }}
    >
      <div className="min-w-0">
        <span className="text-sm">📁 {folder.name}</span>
        {folder.description && (
          <span className="ml-2 text-xs text-ink-4">{folder.description}</span>
        )}
      </div>
      <form action={archiveFolder}>
        <input type="hidden" name="folder_id" value={folder.id} />
        <input type="hidden" name="slug" value={slug} />
        <button
          type="submit"
          className="text-xs text-ink-4 hover:text-bad"
          title="Ordner archivieren (Aufgaben bleiben erhalten)"
        >
          Archivieren
        </button>
      </form>
    </div>
  );
}

// --- Workload ---------------------------------------------------------------

async function Workload({
  workspaceId,
  departmentId,
  capacity,
}: {
  workspaceId: string;
  departmentId: string;
  capacity: number | null;
}) {
  const [ownTasks, crossTagged] = await Promise.all([
    listBoardTasks(departmentId),
    listCrossTaggedTasks(departmentId),
  ]);
  const seen = new Set(ownTasks.map((t) => t.id));
  const tasks = [...ownTasks, ...crossTagged.filter((t) => !seen.has(t.id))];
  const workload = await departmentWorkload(workspaceId, tasks);

  return <WorkloadView workload={workload} capacityHours={capacity} />;
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
  const [docs, folders, projects] = await Promise.all([
    listDocuments(departmentId),
    listFolders(departmentId),
    listProjects(departmentId),
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
          <div className="grid grid-cols-2 gap-3">
            <select
              name="project_id"
              defaultValue=""
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="">Kein Projekt</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              name="ai_mode"
              defaultValue="inherit"
              className="rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="inherit">KI-Ablage: Erbt</option>
              <option value="on">KI-Ablage: An</option>
              <option value="off">KI-Ablage: Aus</option>
            </select>
          </div>
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

async function Settings({
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
  const ws = await getOrCreateWorkspace();
  const [deptMembers, wsMembers] = await Promise.all([
    listDepartmentMembers(departmentId),
    listWorkspaceMembers(ws.id),
  ]);
  const nameOf = (id: string) =>
    wsMembers.find((m) => m.user_id === id)?.display_name || id.slice(0, 8);
  const candidates = wsMembers.filter(
    (m) => !deptMembers.some((d) => d.user_id === m.user_id),
  );

  return (
    <div className="max-w-2xl space-y-8">
    {/* Members (Wrike space settings: manage members and sharing). */}
    <section className="space-y-3 rounded-xl border border-rule bg-paper p-5">
      <h2 className="text-sm font-semibold">Mitglieder</h2>
      <p className="text-xs text-ink-4">
        Mitglieder dieser Abteilung erhalten deren Benachrichtigungen (neue
        Anfragen, Statusänderungen). Ohne explizite Mitglieder geht das Signal
        an alle im Workspace.
      </p>
      {deptMembers.length > 0 && (
        <ul className="space-y-1.5">
          {deptMembers.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between rounded-lg border border-rule-soft px-3 py-2 text-sm"
            >
              <span>
                {nameOf(m.user_id)}
                <span className="ml-2 text-xs text-ink-4">{m.role}</span>
              </span>
              <form action={removeDepartmentMember}>
                <input type="hidden" name="department_id" value={departmentId} />
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="user_id" value={m.user_id} />
                <button type="submit" className="text-xs text-ink-4 hover:text-bad">
                  Entfernen
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <form action={addDepartmentMember} className="flex gap-2 text-sm">
          <input type="hidden" name="department_id" value={departmentId} />
          <input type="hidden" name="slug" value={slug} />
          <select
            name="user_id"
            required
            className="flex-1 rounded-lg border border-rule bg-paper px-3 py-2"
          >
            {candidates.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
          <select
            name="role"
            defaultValue="member"
            className="rounded-lg border border-rule bg-paper px-3 py-2"
          >
            <option value="member">Mitglied</option>
            <option value="lead">Lead</option>
            <option value="viewer">Beobachter</option>
          </select>
          <button
            type="submit"
            className="rounded-lg border border-rule px-3 py-2 text-xs font-medium hover:border-action"
          >
            + Hinzufügen
          </button>
        </form>
      )}
    </section>

    <form action={updateDepartmentContext} className="grid gap-4">
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
    </div>
  );
}
