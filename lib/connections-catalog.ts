// Static catalog of supported external services. V1 backs this with
// a stub OAuth flow (mock token, immediate "connected" status) so the
// UI is exercisable without provider credentials. V2 fills in the
// real oauth_*, mcp_server, and capabilities-execution layers.
//
// Each entry is intentionally narrow about what its capabilities
// promise — what the workflow runtime will actually be able to call
// once the V3 runtime spawns the matching MCP server. We're publishing
// intent here, not capability.

export type ProviderId =
  | "hubspot"
  | "gmail"
  | "google_calendar"
  | "notion"
  | "whatsapp"
  | "slack"
  | "linkedin"
  | "outlook"
  | "webhook";

export type AuthType = "oauth" | "api_key" | "webhook";

export interface ProviderDef {
  id: ProviderId;
  name: string;
  vendor: string;
  glyph: string;
  description: string;
  category: "crm" | "comm" | "productivity" | "social" | "webhook";
  auth_type: AuthType;
  // Default scopes Patrick almost always wants. User can refine in V2.
  default_scopes: string[];
  capabilities: {
    read?: string[];
    write?: string[];
  };
  // V2 MCP-runtime hints — npm package name or HTTP endpoint of the
  // MCP server we'd spawn for this provider. Not consumed in V1.
  mcp_server?: {
    transport: "stdio" | "http";
    package?: string;
    endpoint?: string;
  };
  status: "stub" | "alpha" | "live";
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "hubspot",
    name: "HubSpot",
    vendor: "HubSpot, Inc.",
    glyph: "Hs",
    description:
      "Bidirektionaler Kontakt- und Engagement-Sync. Pull HubSpot Contacts in ECHO; push ECHO-Personen + log_interaction als HubSpot Engagements.",
    category: "crm",
    auth_type: "oauth",
    default_scopes: [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.companies.read",
      "crm.schemas.contacts.read",
    ],
    capabilities: {
      read: [
        "Contacts (Liste + Lifecycle)",
        "Companies",
        "Deals + Engagements",
      ],
      write: [
        "Contact create / update",
        "Engagement (Note / Call / Meeting)",
        "Add to List",
      ],
    },
    mcp_server: {
      transport: "stdio",
      package: "@hubspot/mcp-server",
    },
    status: "stub",
  },
  {
    id: "gmail",
    name: "Gmail",
    vendor: "Google",
    glyph: "Gm",
    description:
      "Eingehende Email-Signaturen extrahieren → create_person Vorschlag. Outbound: send_email Action aus Workflows.",
    category: "comm",
    auth_type: "oauth",
    default_scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    capabilities: {
      read: [
        "Inbox / Threads",
        "Email-Signaturen parsen",
        "Anhänge listen",
      ],
      write: ["Email senden", "Draft anlegen"],
    },
    mcp_server: {
      transport: "stdio",
      package: "@modelcontextprotocol/server-gmail",
    },
    status: "stub",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    vendor: "Google",
    glyph: "GC",
    description:
      "Termine als Interaktionen importieren, Geburtstage als Events publishen. Pärchen mit Gmail.",
    category: "productivity",
    auth_type: "oauth",
    default_scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    capabilities: {
      read: ["Termine + Attendees", "Free/Busy"],
      write: ["Event anlegen", "RSVP"],
    },
    mcp_server: {
      transport: "stdio",
      package: "@modelcontextprotocol/server-google-calendar",
    },
    status: "stub",
  },
  {
    id: "notion",
    name: "Notion",
    vendor: "Notion Labs",
    glyph: "No",
    description:
      "Personen + Organisationen als Notion-DB-Pages exportieren. Read: Pages indexieren als Notes.",
    category: "productivity",
    auth_type: "oauth",
    default_scopes: ["read_content", "update_content", "insert_content"],
    capabilities: {
      read: ["Pages + Databases", "Page-Blocks"],
      write: ["Page anlegen", "Property updaten"],
    },
    mcp_server: {
      transport: "http",
      endpoint: "https://mcp.notion.com",
    },
    status: "stub",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    vendor: "Meta",
    glyph: "Wa",
    description:
      "Inbound-Webhook für Nachrichten → log_interaction. Outbound: Templates senden via Cloud API. Erfordert Meta-Business-Verifizierung.",
    category: "comm",
    auth_type: "api_key",
    default_scopes: [],
    capabilities: {
      read: ["Webhook-Empfang Messages"],
      write: ["Template-Send", "Reply"],
    },
    mcp_server: {
      transport: "http",
      endpoint: "https://graph.facebook.com/v20.0",
    },
    status: "stub",
  },
  {
    id: "slack",
    name: "Slack",
    vendor: "Slack Technologies",
    glyph: "Sl",
    description:
      "DMs / Channels als Interaktionen taggen. Notifications aus Reminders posten.",
    category: "comm",
    auth_type: "oauth",
    default_scopes: ["chat:write", "channels:history", "users:read"],
    capabilities: {
      read: ["DM-Verlauf", "Channel-Members"],
      write: ["Message senden", "Reaction"],
    },
    mcp_server: {
      transport: "stdio",
      package: "@modelcontextprotocol/server-slack",
    },
    status: "stub",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    vendor: "LinkedIn / Microsoft",
    glyph: "Li",
    description:
      "Connection-Daten anreichern, Public-Profile importieren. ToS-restriktiv — V2 prüft was rechtlich machbar ist.",
    category: "social",
    auth_type: "oauth",
    default_scopes: ["r_liteprofile", "r_emailaddress"],
    capabilities: {
      read: ["eigenes Profil", "Verbindungen (limited)"],
      write: ["Post (Sharing API)"],
    },
    status: "stub",
  },
  {
    id: "outlook",
    name: "Outlook",
    vendor: "Microsoft",
    glyph: "Ou",
    description:
      "Microsoft 365 Mail + Calendar — Alternative zu Gmail / Google Calendar.",
    category: "comm",
    auth_type: "oauth",
    default_scopes: [
      "Mail.Read",
      "Mail.Send",
      "Calendars.ReadWrite",
      "User.Read",
    ],
    capabilities: {
      read: ["Inbox", "Termine"],
      write: ["Email senden", "Event anlegen"],
    },
    status: "stub",
  },
  {
    id: "webhook",
    name: "Webhooks",
    vendor: "Generic",
    glyph: "wH",
    description:
      "Catch-all für Zapier / Make / n8n / eigene URLs. Outbound: POST Event-Payloads. Kein OAuth.",
    category: "webhook",
    auth_type: "webhook",
    default_scopes: [],
    capabilities: {
      write: ["POST mit JSON-Body", "HMAC-Signature"],
    },
    status: "stub",
  },
];

export function findProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providersByCategory(
  category: ProviderDef["category"],
): ProviderDef[] {
  return PROVIDERS.filter((p) => p.category === category);
}
