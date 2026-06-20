// Best-effort transactional email for hub notifications.
//
// Provider strategy, in order:
//   1. Resend  — if RESEND_API_KEY is set (simple HTTPS API, no SDK needed).
//   2. Microsoft Graph sendMail — if MS_GRAPH_TOKEN is set (consistent with
//      the Microsoft/Entra ecosystem the rest of the hub uses).
//   3. None    — log and report "skipped" so the caller can record it.
//
// Never throws: notification dispatch must not fail because email is
// misconfigured. Returns a coarse status the dispatcher persists.

export type EmailResult = "sent" | "skipped" | "failed";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const FROM =
  process.env.PM_EMAIL_FROM || "Abteilungs-Hub <no-reply@example.com>";

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (!msg.to) return "skipped";
  try {
    if (process.env.RESEND_API_KEY) return await sendViaResend(msg);
    if (process.env.MS_GRAPH_TOKEN) return await sendViaGraph(msg);
  } catch {
    return "failed";
  }
  // No provider configured — make the intent observable in logs without
  // leaking PII bodies.
  console.info(`[pm/email] skipped (no provider): "${msg.subject}" → ${msg.to}`);
  return "skipped";
}

async function sendViaResend(msg: EmailMessage): Promise<EmailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html ?? textToHtml(msg.text),
    }),
  });
  return res.ok ? "sent" : "failed";
}

async function sendViaGraph(msg: EmailMessage): Promise<EmailResult> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MS_GRAPH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: msg.subject,
        body: { contentType: "HTML", content: msg.html ?? textToHtml(msg.text) },
        toRecipients: [{ emailAddress: { address: msg.to } }],
      },
      saveToSentItems: false,
    }),
  });
  return res.ok ? "sent" : "failed";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textToHtml(text: string): string {
  const body = escapeHtml(text).replace(/\n/g, "<br>");
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#14110d">${body}</div>`;
}
