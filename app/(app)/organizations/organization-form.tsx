"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Organization } from "@/lib/types";
import { StickySaveBar } from "@/components/sticky-save-bar";

type Action = (formData: FormData) => void | Promise<void>;

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

const TAG_DATALIST_ID = "echo-org-tag-suggestions";

export function OrganizationForm({
  initial,
  action,
  cancelHref,
  error,
  existingTags = [],
}: {
  initial?: Partial<Organization>;
  action: Action;
  cancelHref: string;
  error?: string;
  existingTags?: string[];
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [domain, setDomain] = useState(initial?.domain ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [size, setSize] = useState(initial?.size ?? "");
  const [hq, setHq] = useState(initial?.hq ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [justEnriched, setJustEnriched] = useState(false);

  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enrichSummary, setEnrichSummary] = useState<string | null>(null);
  const [enrichConfidence, setEnrichConfidence] = useState<
    "high" | "medium" | "low" | null
  >(null);

  const formRef = useRef<HTMLFormElement | null>(null);

  function commitTag() {
    const v = tagInput.trim();
    if (!v) return;
    if (!tags.includes(v)) setTags([...tags, v]);
    setTagInput("");
  }

  async function runEnrich() {
    if (!name.trim()) {
      setEnrichError("Erst Namen eingeben.");
      return;
    }
    setEnriching(true);
    setEnrichError(null);
    setEnrichSummary(null);
    setEnrichConfidence(null);
    try {
      const res = await fetch("/api/enrich-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), domain: domain || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Enrich ${res.status}`);
      }
      const { data } = (await res.json()) as {
        data: {
          industry: string | null;
          website: string | null;
          domain: string | null;
          size: string | null;
          hq: string | null;
          description: string | null;
          tags: string[];
          confidence: "high" | "medium" | "low";
          uncertain: boolean;
        };
      };

      if (data.uncertain) {
        setEnrichError(
          "Konnte die Organisation nicht eindeutig identifizieren — manuell prüfen.",
        );
        return;
      }

      const filled: string[] = [];
      if (data.industry && !industry) {
        setIndustry(data.industry);
        filled.push("Branche");
      }
      if (data.website && !website) {
        setWebsite(data.website);
        filled.push("Website");
      }
      if (data.domain && !domain) {
        setDomain(data.domain);
        filled.push("Domain");
      }
      if (data.size && !size) {
        setSize(data.size);
        filled.push("Größe");
      }
      if (data.hq && !hq) {
        setHq(data.hq);
        filled.push("HQ");
      }
      if (data.description && !description) {
        setDescription(data.description);
        filled.push("Beschreibung");
      }
      if (data.tags.length) {
        const newTags = data.tags.filter((t) => !tags.includes(t));
        if (newTags.length) {
          setTags([...tags, ...newTags]);
          filled.push(`${newTags.length} Tags`);
        }
      }

      setEnrichConfidence(data.confidence);
      setJustEnriched(true);
      setEnrichSummary(
        filled.length > 0
          ? `Vorausgefüllt: ${filled.join(", ")}`
          : "Keine neuen Daten gefunden — alles bereits gesetzt.",
      );
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Enrich fehlgeschlagen");
    } finally {
      setEnriching(false);
    }
  }

  return (
    <form ref={formRef} action={action} className="space-y-10">
      <StickySaveBar formRef={formRef} cancelHref={cancelHref} />
      <input type="hidden" name="tags" value={tags.join(", ")} />
      {justEnriched && <input type="hidden" name="enriched" value="1" />}

      <div className="rounded border border-rule bg-paper-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="t-label">Auto-Enrich</p>
            <p className="text-xs text-ink-3">
              Claude füllt Branche, Website, Größe, HQ, Beschreibung und Tags
              auf Basis seines Trainings aus. Nur Felder, die leer sind,
              werden überschrieben.
            </p>
          </div>
          <button
            type="button"
            onClick={runEnrich}
            disabled={enriching || !name.trim()}
            className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
          >
            {enriching ? "Recherchiere…" : "Auto-Enrich"}
          </button>
        </div>
        {enrichSummary && (
          <p
            className="mt-2 text-xs"
            style={{ color: "var(--action)" }}
          >
            {enrichSummary}
            {enrichConfidence && ` · Confidence: ${enrichConfidence}`}
          </p>
        )}
        {enrichError && (
          <p className="mt-2 text-xs text-bad">{enrichError}</p>
        )}
      </div>

      <Section label="Identität">
        <Field label="Name" required>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Domain">
            <input
              name="domain"
              value={domain ?? ""}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="acme.com"
              className={inputClass}
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              name="website"
              value={website ?? ""}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://acme.com"
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section label="Profil">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Branche">
            <input
              name="industry"
              value={industry ?? ""}
              onChange={(e) => setIndustry(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Größe" hint="z.B. 50-250">
            <input
              name="size"
              value={size ?? ""}
              onChange={(e) => setSize(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Hauptsitz">
          <input
            name="hq"
            value={hq ?? ""}
            onChange={(e) => setHq(e.target.value)}
            placeholder="Berlin / München / San Francisco …"
            className={inputClass}
          />
        </Field>
        <Field label="Beschreibung">
          <textarea
            name="description"
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="1-2 Sätze, was die Organisation tut."
            className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          />
        </Field>
      </Section>

      <Section label="Tags" hint="Schreib einen Tag, dann Enter. Klick × zum Entfernen.">
        <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded border border-rule bg-paper px-2 py-1.5 focus-within:border-action focus-within:ring-2 focus-within:ring-action/20">
          {tags.map((t) => (
            <span key={t} className="tag">
              <span className="dot" />
              {t}
              <button
                type="button"
                onClick={() => setTags(tags.filter((x) => x !== t))}
                className="-mr-0.5 ml-0.5 text-ink-4 transition hover:text-bad"
                aria-label={`Tag ${t} entfernen`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            list={TAG_DATALIST_ID}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitTag();
                return;
              }
              if (
                e.key === "Backspace" &&
                tagInput === "" &&
                tags.length > 0
              ) {
                setTags(tags.slice(0, -1));
              }
            }}
            onBlur={commitTag}
            placeholder={tags.length === 0 ? "B2B, Open Source, Konkurrent…" : ""}
            className="min-w-32 flex-1 bg-transparent text-sm text-ink-1 outline-none placeholder:text-ink-4"
          />
          <datalist id={TAG_DATALIST_ID}>
            {existingTags
              .filter((t) => !tags.includes(t))
              .map((t) => (
                <option key={t} value={t} />
              ))}
          </datalist>
        </div>
      </Section>

      <Section label="Notizen" hint="Privat — sichtbar nur für dich.">
        <textarea
          name="notes"
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Was du dir merken willst — Beobachtungen, Strategien, Stakeholder."
          className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
        />
      </Section>

      {error && <p className="text-sm text-bad">Fehler: {error}</p>}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href={cancelHref}
          className="rounded border border-rule px-4 py-2 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
        >
          Abbrechen
        </Link>
        <button
          type="submit"
          className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
        >
          Speichern
        </button>
      </div>
    </form>
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
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="t-label">
        {label}
        {required && <span className="ml-1 text-action">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-ink-4">{hint}</span>}
    </label>
  );
}
