"use client";

// WhatsApp-Draft-Generator (Phase D1, Briefing v3 Section 18).
//
// Tab-Bar mit den 6 Use-Cases → Klick generiert Draft via API →
// Card mit Draft-Text + Edit/Regenerate/Senden + Reasoning-Box.
//
// Briefing-Layout-Vorlage: zweiter Screenshot von Patrick. Drei
// Aktionen: "Anpassen" (Textarea zum Editieren), "Neu generieren"
// (regenerate), "Senden" (öffnet wa.me mit Text vorausgefüllt).

import { useState } from "react";
import type { PersonContact } from "@/lib/types";
import {
  DRAFT_USE_CASE_DESCRIPTIONS,
  DRAFT_USE_CASE_LABELS,
  type DraftUseCase,
} from "@/lib/drafts-types";

const USE_CASES: DraftUseCase[] = [
  "reengage",
  "business",
  "birthday",
  "intro_thanks",
  "follow_up",
  "lebenszeichen",
];

interface Draft {
  text: string;
  reasoning: string;
  useCase: DraftUseCase;
}

function normalizeForWaMe(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export function DraftGenerator({
  personId,
  personName,
  contacts,
}: {
  personId: string;
  personName: string;
  contacts: PersonContact[];
}) {
  // V3-Migration: phones/whatsapp aus person_contacts ableiten.
  const waContacts = contacts.filter(
    (c) => c.channel === "whatsapp" || c.channel === "phone",
  );
  const [active, setActive] = useState<DraftUseCase | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  async function generate(useCase: DraftUseCase) {
    setActive(useCase);
    setLoading(true);
    setError(null);
    setDraft(null);
    setEditing(false);
    try {
      const res = await fetch("/api/drafts/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: personId, use_case: useCase }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Fehler");
      }
      setDraft(data);
      setEditText(data.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  function sendWhatsApp() {
    // WhatsApp-Channel bevorzugen (V3 macht's explizit), sonst die
    // primary phone — sonst irgendeine phone.
    const target =
      waContacts.find((c) => c.is_primary) ?? waContacts[0];
    if (!target) {
      setError("Keine Telefonnummer hinterlegt");
      return;
    }
    const digits = normalizeForWaMe(target.value);
    const text = editing ? editText : (draft?.text ?? "");
    if (!text.trim()) return;
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const hasPhone = waContacts.length > 0;

  return (
    <section className="space-y-4">
      <div className="section-head">
        <span className="t-label">KI-Entwurf für WhatsApp</span>
        <span className="rule" />
      </div>

      {/* Use-Case Tab-Bar */}
      <div className="flex flex-wrap gap-2">
        {USE_CASES.map((uc) => (
          <button
            key={uc}
            type="button"
            onClick={() => generate(uc)}
            disabled={loading}
            title={DRAFT_USE_CASE_DESCRIPTIONS[uc]}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              active === uc
                ? "border-action bg-action-soft text-ink-1"
                : "border-rule bg-paper text-ink-2 hover:border-action/40 hover:bg-paper-2"
            } ${loading ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {DRAFT_USE_CASE_LABELS[uc]}
          </button>
        ))}
      </div>

      {!active && (
        <p className="text-xs text-ink-3">
          Wähl einen Use-Case oben — {personName} bekommt einen
          personalisierten Entwurf basierend auf Tags, Passions, letzter
          Interaktion und Tiefe der Beziehung.
        </p>
      )}

      {loading && (
        <div className="rounded border border-rule bg-paper px-4 py-6 text-center text-sm text-ink-3">
          ECHO denkt nach…
        </div>
      )}

      {error && (
        <div className="rounded border border-bad/40 bg-bad/5 px-4 py-3 text-sm text-bad">
          Fehler: {error}
        </div>
      )}

      {draft && !loading && (
        <div className="space-y-3">
          {/* Draft-Card */}
          <div className="overflow-hidden rounded-2xl border-l-4 border-l-[#25D366] border-y border-r border-rule bg-paper">
            <header className="border-b border-rule-soft bg-paper-2 px-4 py-2">
              <span className="t-label" style={{ color: "#25D366" }}>
                KI-Entwurf · {DRAFT_USE_CASE_LABELS[draft.useCase]}
              </span>
            </header>
            <div className="space-y-3 px-4 py-4">
              {editing ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={Math.max(4, editText.split("\n").length + 1)}
                  className="w-full resize-y rounded border border-rule bg-paper px-3 py-2 text-sm leading-relaxed text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-1">
                  {draft.text}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(true);
                      setEditText(draft.text);
                    }}
                    className="rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action"
                  >
                    Anpassen
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                    }}
                    className="rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
                  >
                    Original behalten
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => generate(draft.useCase)}
                  disabled={loading}
                  className="rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action disabled:opacity-50"
                >
                  Neu generieren
                </button>
                <button
                  type="button"
                  onClick={sendWhatsApp}
                  disabled={!hasPhone}
                  className="ml-auto inline-flex items-center gap-2 rounded px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "#25D366" }}
                  title={
                    !hasPhone
                      ? "Keine Telefonnummer hinterlegt"
                      : "Öffnet WhatsApp mit voraus­gefülltem Text"
                  }
                >
                  Senden →
                </button>
              </div>
            </div>
          </div>

          {/* Reasoning */}
          {draft.reasoning && (
            <div className="rounded border-l-2 border-l-action/40 bg-action-soft/30 px-4 py-3">
              <p className="t-label mb-1.5">Was ECHO dabei berücksichtigt hat</p>
              <p className="text-xs leading-relaxed text-ink-2">
                {draft.reasoning}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
