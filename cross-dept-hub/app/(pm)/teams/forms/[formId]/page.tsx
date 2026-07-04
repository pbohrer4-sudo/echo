import { notFound } from "next/navigation";
import { getRequestForm } from "@/lib/pm/forms";
import { getDepartmentById } from "@/lib/pm/departments";
import { submitRequestForm } from "../../actions";

export const dynamic = "force-dynamic";

// Fill-in page for a dynamic request form. Submitting creates a routed,
// pre-structured task in the target department.
export default async function RequestFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ formId: string }>;
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const { formId } = await params;
  const { error, submitted } = await searchParams;

  const form = await getRequestForm(formId);
  if (!form) notFound();
  const target = await getDepartmentById(form.target_department_id);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="t-label">Anfrageformular</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {form.title}
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          Geht an: {target?.name ?? "—"}
          {form.default_due_days
            ? ` · Frist: ${form.default_due_days} Tage nach Einreichung`
            : ""}
        </p>
        {form.description && (
          <p className="mt-2 text-sm text-ink-2">{form.description}</p>
        )}
      </div>

      {submitted && (
        <p className="rounded-lg border border-good/40 bg-good/5 px-3 py-2 text-sm text-ink-2">
          Danke - die Anfrage wurde als Aufgabe bei {target?.name ?? "der Abteilung"}{" "}
          angelegt und das Team benachrichtigt.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      {!form.active ? (
        <p className="rounded-lg border border-rule bg-paper-2 px-3 py-2 text-sm text-ink-3">
          Dieses Formular ist derzeit deaktiviert.
        </p>
      ) : (
        <form
          action={submitRequestForm}
          className="grid gap-4 rounded-xl border border-rule bg-paper p-5 text-sm"
        >
          <input type="hidden" name="form_id" value={form.id} />
          <label>
            <span className="text-ink-3">Titel der Anfrage</span>
            <input
              name="request_title"
              required
              placeholder="Kurz und prägnant"
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
            />
          </label>
          {form.fields.map((f) => (
            <label key={f.key}>
              <span className="text-ink-3">
                {f.label}
                {f.required ? " *" : ""}
              </span>
              {f.type === "textarea" ? (
                <textarea
                  name={`f_${f.key}`}
                  rows={3}
                  required={f.required}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                />
              ) : f.type === "select" ? (
                <select
                  name={`f_${f.key}`}
                  required={f.required}
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  <option value="" disabled>
                    Bitte wählen…
                  </option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name={`f_${f.key}`}
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  required={f.required}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                />
              )}
            </label>
          ))}
          <button
            type="submit"
            className="justify-self-start rounded-lg bg-action px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            Anfrage einreichen
          </button>
        </form>
      )}
    </div>
  );
}
