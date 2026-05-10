"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface DupeMatch {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  reason: string;
}

// Renders an inline warning when the user types data into the
// new-person form that matches someone already in the CRM. Hits
// /api/people/duplicate-check on every keystroke (debounced) so the
// match list updates as they type.
//
// Stays hidden when matches are empty so existing users in clean
// workflows never see the banner.
export function DuplicateCheckBanner({
  name,
  primaryEmail,
  primaryPhone,
}: {
  name: string;
  primaryEmail: string;
  primaryPhone: string;
}) {
  const [matches, setMatches] = useState<DupeMatch[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const n = name.trim();
    const e = primaryEmail.trim();
    const p = primaryPhone.replace(/\D/g, "");
    if (n.length < 2 && e.length < 4 && p.length < 5) {
      setMatches([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (n) params.set("name", n);
        if (e) params.set("email", e);
        if (p) params.set("phone", p);
        const res = await fetch(`/api/people/duplicate-check?${params}`);
        if (!res.ok) return;
        const data = (await res.json()) as { matches: DupeMatch[] };
        setMatches(data.matches ?? []);
      } catch {
        // fail silent — banner stays hidden, user can still create
      }
    }, 350);
  }, [name, primaryEmail, primaryPhone]);

  if (dismissed || matches.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-signal/40 bg-signal-soft/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="t-label">Mögliches Duplikat</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-ink-3 transition hover:text-ink-1"
          aria-label="Hinweis schließen"
        >
          ×
        </button>
      </div>
      <p className="text-xs text-ink-3">
        Eine dieser Personen könnte schon das sein, was du gerade anlegst —
        öffne sie statt eine neue Person zu erstellen.
      </p>
      <ul className="space-y-1">
        {matches.map((m) => (
          <li key={m.id}>
            <Link
              href={`/people/${m.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-paper px-3 py-2 transition hover:border-action"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink-1">
                  {m.name}
                </span>
                {(m.company || m.role) && (
                  <span className="block truncate text-xs text-ink-3">
                    {[m.role, m.company].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              <span className="shrink-0 rounded-full border border-signal/40 bg-paper-2 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-3">
                {m.reason}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
