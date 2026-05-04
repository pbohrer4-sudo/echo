import type { Interaction, Note } from "@/lib/types";

type TimelineItem =
  | { kind: "interaction"; data: Interaction; at: string }
  | { kind: "note"; data: Note; at: string };

function fmtAt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_LABEL: Record<string, string> = {
  meeting: "Treffen",
  call: "Anruf",
  email: "Email",
  note: "Notiz",
  voice: "Voice",
};

const SENTIMENT_TONE: Record<string, string> = {
  positive: "text-[#c8ff3e]",
  tense: "text-red-400",
  neutral: "text-neutral-400",
};

export function PersonTimeline({
  interactions,
  notes,
}: {
  interactions: Interaction[];
  notes: Note[];
}) {
  const items: TimelineItem[] = [
    ...interactions.map((i) => ({
      kind: "interaction" as const,
      data: i,
      at: i.occurred_at,
    })),
    ...notes.map((n) => ({
      kind: "note" as const,
      data: n,
      at: n.created_at,
    })),
  ];
  items.sort((a, b) => b.at.localeCompare(a.at));

  if (items.length === 0) {
    return (
      <p className="text-sm italic text-neutral-500">
        Noch keine Interaktionen oder Notizen.
      </p>
    );
  }

  return (
    <ol className="space-y-5">
      {items.map((item) => {
        if (item.kind === "interaction") {
          const i = item.data;
          return (
            <li key={`i-${i.id}`} className="space-y-1">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-mono uppercase text-neutral-500">
                  {TYPE_LABEL[i.type] ?? i.type}
                </span>
                <span className="font-mono text-neutral-600">{fmtAt(i.occurred_at)}</span>
                {i.sentiment && (
                  <span className={SENTIMENT_TONE[i.sentiment] ?? ""}>
                    · {i.sentiment}
                  </span>
                )}
              </div>
              {i.summary && <p className="text-sm text-neutral-200">{i.summary}</p>}
              {(i.topics?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {i.topics.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-neutral-800 px-2 py-0.5 text-xs text-neutral-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        }
        const n = item.data;
        return (
          <li key={`n-${n.id}`} className="space-y-1">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-mono uppercase text-neutral-500">Notiz</span>
              <span className="font-mono text-neutral-600">{fmtAt(n.created_at)}</span>
            </div>
            {n.title && (
              <p className="text-sm font-medium text-neutral-100">{n.title}</p>
            )}
            {n.body && (
              <p className="whitespace-pre-wrap text-sm text-neutral-300">{n.body}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
