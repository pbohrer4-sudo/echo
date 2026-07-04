import { getOrCreateWorkspace, listWorkspaceMembers } from "@/lib/pm/workspace";
import { listDepartments } from "@/lib/pm/departments";
import { listItemTypes } from "@/lib/pm/structure";
import { listAutomationRules, listBlueprints } from "@/lib/pm/automations";
import { listRequestForms } from "@/lib/pm/forms";
import { TASK_STATUS_LABEL, type PmTaskStatus } from "@/lib/pm/types";
import {
  createAutomationRule,
  createItemType,
  createRequestForm,
  deleteAutomationRule,
  deleteBlueprint,
  deleteItemType,
  toggleAutomationRule,
  toggleRequestForm,
  updateAiSettings,
} from "../actions";

export const dynamic = "force-dynamic";

const STATUSES: PmTaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
];

export default async function WorkspaceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const ws = await getOrCreateWorkspace();
  const [itemTypes, rules, blueprints, forms, departments, members] =
    await Promise.all([
      listItemTypes(ws.id),
      listAutomationRules(ws.id),
      listBlueprints(ws.id),
      listRequestForms(ws.id),
      listDepartments(ws.id),
      listWorkspaceMembers(ws.id),
    ]);
  const deptName = (id: string | null) =>
    id ? (departments.find((d) => d.id === id)?.name ?? "—") : "Alle Abteilungen";

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="mt-1 text-sm text-ink-3">
          KI-Funktionen, Vorgangstypen, Automatisierungen, Vorlagen und
          Anfrageformulare für den ganzen Workspace.
        </p>
      </div>

      {saved && (
        <p className="rounded-lg border border-good/40 bg-good/5 px-3 py-2 text-sm text-ink-2">
          Gespeichert.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      {/* --- AI ------------------------------------------------------------ */}
      <form action={updateAiSettings} className="space-y-4">
        <fieldset className="space-y-4 rounded-xl border border-rule bg-paper p-5">
          <legend className="px-1 text-sm font-semibold">KI-Funktionen</legend>

          <Toggle
            name="ai_enabled"
            defaultChecked={ws.ai_enabled}
            title="KI aktiviert (Hauptschalter)"
            desc="Wenn aus, läuft keine KI - alle KI-Vorschläge und -Schaltflächen werden ausgeblendet. Der Hub funktioniert vollständig manuell."
          />

          <div className="border-t border-rule-soft pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-4">
              Automatische Aktionen (nur wenn KI aktiviert)
            </p>
            <div className="space-y-4">
              <Toggle
                name="ai_auto_briefing"
                defaultChecked={ws.ai_auto_briefing}
                title="Auto-Briefing für eingehende Anfragen"
                desc="Erstellt automatisch ein Briefing und einen Antwortentwurf, sobald eine abteilungsübergreifende Anfrage eingeht. Aus: die Anfrage bleibt unverändert, ein Briefing kann manuell ausgelöst werden."
              />
              <Toggle
                name="ai_auto_filing"
                defaultChecked={ws.ai_auto_filing}
                title="Auto-Ablagevorschlag für Dokumente"
                desc="Schlägt beim Hinzufügen eines Dokuments automatisch SharePoint-Ordner und Dateinamen vor. Aus: das Dokument wird genau so gespeichert, wie du es eingibst."
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-action px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            KI-Einstellungen speichern
          </button>
        </fieldset>
      </form>

      {/* --- Custom item types ---------------------------------------------- */}
      <section className="space-y-3 rounded-xl border border-rule bg-paper p-5">
        <h2 className="text-sm font-semibold">Vorgangstypen</h2>
        <p className="text-xs text-ink-4">
          Eigene Arbeitstypen wie Bug, Kampagne oder Asset - jeder Typ bringt
          eigene Felder mit, die auf der Aufgaben-Detailseite ausgefüllt
          werden.
        </p>
        {itemTypes.length > 0 && (
          <ul className="space-y-1.5">
            {itemTypes.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between rounded-lg border border-rule-soft px-3 py-2 text-sm"
              >
                <span>
                  {it.icon} {it.name}
                  <span className="ml-2 text-xs text-ink-4">
                    {it.fields.map((f) => f.label).join(", ") || "keine Felder"}
                  </span>
                </span>
                <form action={deleteItemType}>
                  <input type="hidden" name="item_type_id" value={it.id} />
                  <button type="submit" className="text-xs text-ink-4 hover:text-bad">
                    Löschen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            + Neuer Vorgangstyp
          </summary>
          <form action={createItemType} className="mt-3 grid gap-3 text-sm">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <input
                name="icon"
                placeholder="🐞"
                maxLength={4}
                className="rounded-lg border border-rule bg-paper px-3 py-2"
              />
              <input
                name="name"
                required
                placeholder="Name (z.B. Bug, Kampagne, Asset)"
                className="rounded-lg border border-rule bg-paper px-3 py-2"
              />
            </div>
            <label>
              <span className="text-ink-3">
                Felder - eine Zeile pro Feld: <code>key | Label | typ</code>{" "}
                (typ: text, number, date oder select: Option1, Option2)
              </span>
              <textarea
                name="fields_raw"
                rows={3}
                placeholder={"browser | Browser | text\nschwere | Schweregrad | select: Niedrig, Mittel, Hoch"}
                className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 font-mono text-xs"
              />
            </label>
            <button
              type="submit"
              className="justify-self-start rounded-lg bg-action px-3 py-2 text-xs font-medium text-paper hover:opacity-90"
            >
              Typ anlegen
            </button>
          </form>
        </details>
      </section>

      {/* --- Automations ------------------------------------------------------ */}
      <section className="space-y-3 rounded-xl border border-rule bg-paper p-5">
        <h2 className="text-sm font-semibold">Automatisierungen</h2>
        <p className="text-xs text-ink-4">
          Regelbasiert, ohne KI: Wenn eine Aufgabe einen Status erreicht,
          werden Aktionen ausgeführt (zuweisen, Kommentar, Benachrichtigung).
        </p>
        {rules.length > 0 && (
          <ul className="space-y-1.5">
            {rules.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-rule-soft px-3 py-2 text-sm"
              >
                <span className={r.active ? "" : "text-ink-4 line-through"}>
                  {r.name}
                  <span className="ml-2 text-xs text-ink-4">
                    bei &quot;{TASK_STATUS_LABEL[r.trigger_status]}&quot; ·{" "}
                    {deptName(r.department_id)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <form action={toggleAutomationRule}>
                    <input type="hidden" name="rule_id" value={r.id} />
                    <input type="hidden" name="active" value={String(!r.active)} />
                    <button type="submit" className="text-xs text-ink-3 hover:text-action">
                      {r.active ? "Pausieren" : "Aktivieren"}
                    </button>
                  </form>
                  <form action={deleteAutomationRule}>
                    <input type="hidden" name="rule_id" value={r.id} />
                    <button type="submit" className="text-xs text-ink-4 hover:text-bad">
                      Löschen
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            + Neue Regel
          </summary>
          <form action={createAutomationRule} className="mt-3 grid gap-3 text-sm">
            <input
              name="name"
              required
              placeholder="Name (z.B. Review an Design-Lead)"
              className="rounded-lg border border-rule bg-paper px-3 py-2"
            />
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="text-ink-3">Wenn Status wird…</span>
                <select
                  name="trigger_status"
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-ink-3">Gilt für</span>
                <select
                  name="department_id"
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  <option value="">Alle Abteilungen</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="text-ink-3">Dann zuweisen an (optional)</span>
                <select
                  name="assign_to"
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  <option value="">Niemanden</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.user_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-ink-3">Kommentar hinzufügen (optional)</span>
                <input
                  name="add_comment"
                  placeholder="z.B. Bitte Review starten"
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-ink-3">
              <input type="checkbox" name="notify_department" />
              Abteilung benachrichtigen
            </label>
            <button
              type="submit"
              className="justify-self-start rounded-lg bg-action px-3 py-2 text-xs font-medium text-paper hover:opacity-90"
            >
              Regel anlegen
            </button>
          </form>
        </details>
      </section>

      {/* --- Blueprints -------------------------------------------------------- */}
      <section className="space-y-3 rounded-xl border border-rule bg-paper p-5">
        <h2 className="text-sm font-semibold">Vorlagen (Blueprints)</h2>
        <p className="text-xs text-ink-4">
          Wiederverwendbare Aufgaben-Vorlagen inkl. Unteraufgaben. Erstellen:
          auf einer Aufgabe &quot;Als Vorlage speichern&quot;. Verwenden: beim
          Anlegen einer Aufgabe die Vorlage auswählen.
        </p>
        {blueprints.length === 0 ? (
          <p className="text-sm text-ink-3">Noch keine Vorlagen.</p>
        ) : (
          <ul className="space-y-1.5">
            {blueprints.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-rule-soft px-3 py-2 text-sm"
              >
                <span>
                  {b.name}
                  <span className="ml-2 text-xs text-ink-4">
                    {(b.payload.subtasks ?? []).length} Unteraufgaben ·{" "}
                    {deptName(b.department_id)}
                  </span>
                </span>
                <form action={deleteBlueprint}>
                  <input type="hidden" name="blueprint_id" value={b.id} />
                  <button type="submit" className="text-xs text-ink-4 hover:text-bad">
                    Löschen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Request forms -------------------------------------------------------- */}
      <section className="space-y-3 rounded-xl border border-rule bg-paper p-5">
        <h2 className="text-sm font-semibold">Anfrageformulare</h2>
        <p className="text-xs text-ink-4">
          Strukturierte Arbeitsanfragen statt E-Mail-Pingpong: Antworten werden
          automatisch als Aufgabe in der Zielabteilung angelegt, optional aus
          einer Vorlage und mit berechneter Frist.
        </p>
        {forms.length > 0 && (
          <ul className="space-y-1.5">
            {forms.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-lg border border-rule-soft px-3 py-2 text-sm"
              >
                <span className={f.active ? "" : "text-ink-4 line-through"}>
                  <a href={`/teams/forms/${f.id}`} className="hover:text-action">
                    {f.title}
                  </a>
                  <span className="ml-2 text-xs text-ink-4">
                    → {deptName(f.target_department_id)}
                    {f.default_due_days ? ` · Frist: +${f.default_due_days} Tage` : ""}
                  </span>
                </span>
                <form action={toggleRequestForm}>
                  <input type="hidden" name="form_id" value={f.id} />
                  <input type="hidden" name="active" value={String(!f.active)} />
                  <button type="submit" className="text-xs text-ink-3 hover:text-action">
                    {f.active ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            + Neues Formular
          </summary>
          <form action={createRequestForm} className="mt-3 grid gap-3 text-sm">
            <input
              name="title"
              required
              placeholder="Titel (z.B. Video-Anfrage an Marketing)"
              className="rounded-lg border border-rule bg-paper px-3 py-2"
            />
            <textarea
              name="description"
              rows={2}
              placeholder="Beschreibung (optional)"
              className="rounded-lg border border-rule bg-paper px-3 py-2"
            />
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="text-ink-3">Zielabteilung</span>
                <select
                  name="target_department_id"
                  required
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-ink-3">Vorlage anwenden (optional)</span>
                <select
                  name="blueprint_id"
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  <option value="">Keine</option>
                  {blueprints.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="text-ink-3">Standard-Priorität</span>
                <select
                  name="default_priority"
                  defaultValue="medium"
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  <option value="low">Niedrig</option>
                  <option value="medium">Mittel</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </select>
              </label>
              <label>
                <span className="text-ink-3">Frist: Tage nach Einreichung</span>
                <input
                  name="default_due_days"
                  type="number"
                  min="1"
                  placeholder="z.B. 14"
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                />
              </label>
            </div>
            <label>
              <span className="text-ink-3">
                Felder - eine Zeile pro Feld:{" "}
                <code>key | Label | typ | pflicht</code> (typ: text, textarea,
                number, date, select: A, B)
              </span>
              <textarea
                name="fields_raw"
                rows={3}
                placeholder={"zielgruppe | Zielgruppe | text | pflicht\nbudget | Budget (EUR) | number"}
                className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 font-mono text-xs"
              />
            </label>
            <button
              type="submit"
              className="justify-self-start rounded-lg bg-action px-3 py-2 text-xs font-medium text-paper hover:opacity-90"
            >
              Formular anlegen
            </button>
          </form>
        </details>
      </section>
    </div>
  );
}

function Toggle({
  name,
  defaultChecked,
  title,
  desc,
}: {
  name: string;
  defaultChecked: boolean;
  title: string;
  desc: string;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--action)]"
      />
      <span>
        <span className="block text-sm font-medium text-ink-1">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-3">{desc}</span>
      </span>
    </label>
  );
}
