import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "./email";

// Notification fan-out for the department hub. Writes one in-app row per
// recipient and sends a best-effort email. Browser notifications are driven
// separately by a foreground poller against /api/pm/notifications/unread.
//
// Runs in server context (actions / AI orchestrators) under the acting
// user's session, so RLS applies: the actor may insert notifications for
// any member of a workspace they belong to.

export type PmNotificationType =
  | "request_created"
  | "briefing_ready"
  | "briefing_accepted"
  | "status_changed"
  | "comment_added"
  | "document_filed";

export interface PmNotification {
  id: string;
  workspace_id: string;
  recipient_user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  task_id: string | null;
  document_id: string | null;
  email_status: string;
  read_at: string | null;
  created_at: string;
}

interface Recipient {
  user_id: string;
  email: string | null;
}

// Who should hear about something happening in a department: its explicit
// members, or — when none are assigned (MVP default) — every workspace
// member so the signal still reaches a human.
export async function resolveDepartmentRecipients(
  departmentId: string,
  workspaceId: string,
): Promise<Recipient[]> {
  const supabase = await createClient();

  const { data: deptMembers } = await supabase
    .from("pm_department_members")
    .select("user_id")
    .eq("department_id", departmentId);

  const userIds = new Set<string>((deptMembers ?? []).map((m) => m.user_id));

  let rows: { user_id: string; email: string | null }[];
  if (userIds.size > 0) {
    const { data } = await supabase
      .from("pm_workspace_members")
      .select("user_id, email")
      .eq("workspace_id", workspaceId)
      .in("user_id", Array.from(userIds));
    rows = (data ?? []) as { user_id: string; email: string | null }[];
  } else {
    const { data } = await supabase
      .from("pm_workspace_members")
      .select("user_id, email")
      .eq("workspace_id", workspaceId);
    rows = (data ?? []) as { user_id: string; email: string | null }[];
  }

  return rows.map((r) => ({ user_id: r.user_id, email: r.email }));
}

function absoluteUrl(link: string | null): string | null {
  if (!link) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (!base) return link;
  return link.startsWith("http") ? link : `${base}${link}`;
}

export async function notify(opts: {
  workspaceId: string;
  recipients: Recipient[];
  type: PmNotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  taskId?: string | null;
  documentId?: string | null;
  sendEmail?: boolean;
}): Promise<void> {
  const recipients = dedupe(opts.recipients);
  if (recipients.length === 0) return;

  const supabase = await createClient();
  const wantEmail = opts.sendEmail !== false;

  for (const r of recipients) {
    let emailStatus = "skipped";
    if (wantEmail && r.email) {
      const url = absoluteUrl(opts.link ?? null);
      const text = [opts.body ?? "", url ? `\nÖffnen: ${url}` : ""]
        .filter(Boolean)
        .join("\n");
      emailStatus = await sendEmail({
        to: r.email,
        subject: opts.title,
        text: text || opts.title,
      });
    }

    await supabase.from("pm_notifications").insert({
      workspace_id: opts.workspaceId,
      recipient_user_id: r.user_id,
      type: opts.type,
      title: opts.title,
      body: opts.body ?? null,
      link: opts.link ?? null,
      task_id: opts.taskId ?? null,
      document_id: opts.documentId ?? null,
      email_status: emailStatus,
    });
  }
}

function dedupe(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of recipients) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    out.push(r);
  }
  return out;
}

// --- Reads ----------------------------------------------------------------

export async function listNotifications(limit = 50): Promise<PmNotification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as PmNotification[];
}

export async function countUnread(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pm_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}
