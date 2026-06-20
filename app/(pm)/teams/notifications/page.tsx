import Link from "next/link";
import { listNotifications } from "@/lib/pm/notifications";
import { markAllNotificationsRead, markNotificationRead } from "../actions";

export const dynamic = "force-dynamic";

const EMAIL_LABEL: Record<string, string> = {
  sent: "E-Mail gesendet",
  skipped: "keine E-Mail",
  failed: "E-Mail fehlgeschlagen",
  pending: "E-Mail ausstehend",
};

export default async function NotificationsPage() {
  const notifications = await listNotifications();
  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mitteilungen</h1>
          <p className="mt-1 text-sm text-ink-3">
            Status-Updates zu Anfragen, Briefings und Kommentaren. Zustellung
            per App, Browser und E-Mail.
          </p>
        </div>
        {hasUnread && (
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="rounded-lg border border-rule px-3 py-1.5 text-sm hover:border-action"
            >
              Alle als gelesen markieren
            </button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rule bg-paper-2 p-6 text-center text-sm text-ink-3">
          Noch keine Mitteilungen.
        </p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`rounded-xl border p-4 ${
                n.read_at
                  ? "border-rule bg-paper"
                  : "border-action/30 bg-action-soft"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{n.title}</p>
                  {n.body && (
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-ink-3">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-4">
                    <span>{new Date(n.created_at).toLocaleString("de-DE")}</span>
                    <span>· {EMAIL_LABEL[n.email_status] ?? n.email_status}</span>
                    {n.link && (
                      <Link href={n.link} className="text-action hover:underline">
                        Öffnen →
                      </Link>
                    )}
                  </p>
                </div>
                {!n.read_at && (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      className="shrink-0 rounded-lg border border-rule px-2.5 py-1 text-xs hover:border-action"
                    >
                      Gelesen
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
