import type { Interaction, Note } from "@/lib/types";

type TimelineItem =
  | { kind: "interaction"; data: Interaction; at: string }
  | { kind: "note"; data: Note; at: string };

function fmtAt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
  });
}

const TYPE_LABEL: Record<string, string> = {
  meeting: "Treffen",
  call: "Anruf",
  email: "Email",
  note: "Notiz",
  voice: "Voice",
};

function dotClass(item: TimelineItem): string {
  if (item.kind === "interaction") {
    if (item.data.sentiment === "positive") return "tl-dot signal";
    if (item.data.sentiment === "tense") return "tl-dot";
    return "tl-dot action";
  }
  return "tl-dot hollow";
}

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
      <p className="text-sm italic text-ink-3">
        Noch keine Interaktionen oder Notizen.
      </p>
    );
  }

  return (
    <div className="timeline">
      {items.map((item) => {
        if (item.kind === "interaction") {
          const i = item.data;
          return (
            <div className="tl-item" key={`i-${i.id}`}>
              <div className="tl-date">{fmtAt(i.occurred_at)}</div>
              <div className="tl-axis">
                <span className={dotClass(item)} />
              </div>
              <div>
                <div className="tl-kind">{TYPE_LABEL[i.type] ?? i.type}</div>
                {i.summary && <div className="tl-text">{i.summary}</div>}
                <div className="tl-meta">
                  {i.sentiment ?? "neutral"}
                  {(i.topics?.length ?? 0) > 0 && ` · ${i.topics.join(" · ")}`}
                </div>
              </div>
            </div>
          );
        }
        const n = item.data;
        return (
          <div className="tl-item" key={`n-${n.id}`}>
            <div className="tl-date">{fmtAt(n.created_at)}</div>
            <div className="tl-axis">
              <span className={dotClass(item)} />
            </div>
            <div>
              <div className="tl-kind">Notiz</div>
              {n.title && (
                <div className="tl-text font-medium">{n.title}</div>
              )}
              {n.body && (
                <div className="tl-text whitespace-pre-wrap">{n.body}</div>
              )}
              {(n.tags?.length ?? 0) > 0 && (
                <div className="tl-meta">{n.tags.join(" · ")}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
