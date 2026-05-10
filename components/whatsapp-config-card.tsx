"use client";

import { useEffect, useState } from "react";

// One-page setup helper for WhatsApp Cloud API. Shows the webhook URL
// the user has to paste into Meta Business Manager and walks through
// the env vars they need to set. We don't ask for tokens via the
// browser — they live as server env vars only.
export function WhatsappConfigCard() {
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const webhookUrl = origin
    ? `${origin}/api/whatsapp/webhook`
    : "<APP_URL>/api/whatsapp/webhook";

  return (
    <section className="space-y-4 rounded-2xl border border-rule bg-paper-2 p-5">
      <div>
        <p className="t-label">WhatsApp Cloud API Setup</p>
        <p className="mt-1 text-sm text-ink-2">
          Drei Stellen einstellen — danach landen WA-Nachrichten direkt in
          deiner Inbox und auf der jeweiligen Person-Timeline.
        </p>
      </div>

      <ol className="space-y-3 text-sm text-ink-2">
        <li className="rounded border border-rule bg-paper p-3">
          <p className="t-label mb-1">1 · Webhook in Meta Business</p>
          <p className="mb-2 text-xs text-ink-3">
            Meta Business Manager → WhatsApp → Konfiguration → Webhooks
          </p>
          <p className="font-mono text-[11px] break-all rounded border border-rule-soft bg-paper-2 px-2 py-1.5 text-ink-1">
            {webhookUrl}
          </p>
          <p className="mt-2 text-xs text-ink-3">
            Verify-Token = Wert aus <code className="font-mono">WHATSAPP_VERIFY_TOKEN</code>.
            Subscribe to: <span className="font-mono">messages</span> +{" "}
            <span className="font-mono">message_status</span>.
          </p>
        </li>
        <li className="rounded border border-rule bg-paper p-3">
          <p className="t-label mb-1">2 · Env-Variablen in .env.local</p>
          <pre className="overflow-x-auto rounded border border-rule-soft bg-paper-2 px-3 py-2 font-mono text-[11px] text-ink-1">
            {`WHATSAPP_VERIFY_TOKEN=...     # frei wählbar, muss zu Meta passen
WHATSAPP_APP_SECRET=...        # Meta App Secret (für Signatur-Check)
WHATSAPP_ACCESS_TOKEN=...      # System User Long-Lived Token
WHATSAPP_PHONE_NUMBER_ID=...   # numerische ID aus dem WA Dashboard`}
          </pre>
        </li>
        <li className="rounded border border-rule bg-paper p-3">
          <p className="t-label mb-1">3 · Connection-Row anlegen</p>
          <p className="text-xs text-ink-3">
            Drück oben „Verbinden" — der Webhook nutzt anschließend die
            Phone-Number-ID aus <code className="font-mono">config</code> der
            Connection-Row, um deine Echo-User-ID aufzulösen. Eintragen via
            Supabase SQL:
          </p>
          <pre className="mt-2 overflow-x-auto rounded border border-rule-soft bg-paper-2 px-3 py-2 font-mono text-[11px] text-ink-1">
            {`update service_connections
set config = jsonb_set(config, '{phone_number_id}', '"<DEINE_PHONE_NUMBER_ID>"')
where provider = 'whatsapp' and user_id = auth.uid();`}
          </pre>
        </li>
      </ol>
    </section>
  );
}
