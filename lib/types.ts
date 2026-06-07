// Shared domain types — kept manual for now. When the schema stabilises,
// switch to `npx supabase gen types typescript` for codegen.

import type { CustomFieldValues } from "@/lib/custom-fields";

export type Scope = "work" | "personal" | "both";

export type InteractionType = "meeting" | "call" | "email" | "note" | "voice";
export type InteractionSource = "debrief" | "manual" | "calendar";
export type Sentiment = "positive" | "neutral" | "tense";

export type ReminderRecurrence = "once" | "weekly" | "monthly" | "yearly";
export type ReminderType = "check-in" | "birthday" | "promise" | "custom";
export type ReminderStatus = "pending" | "done" | "snoozed";
export type ReminderSource = "manual" | "voice" | "ai-generated";

export type TodoPriority = "low" | "medium" | "high";
export type TodoStatus = "open" | "done" | "cancelled";

export type NoteSource = "voice" | "manual";

export interface Profile {
  id: string;
  display_name: string | null;
  timezone: string;
  language: string;
  voice_id: string;
  debrief_time: string;
  claude_key_byo: string | null;
  elevenlabs_key_byo: string | null;
  created_at: string;
  updated_at: string;
}

export const PHONE_LABELS = [
  "mobile",
  "iPhone",
  "privat",
  "arbeit",
  "haupt",
  "fax",
  "andere",
] as const;
export type PhoneLabel = (typeof PHONE_LABELS)[number] | string;

export interface PhoneEntry {
  label: PhoneLabel;
  value: string;
}

export const EMAIL_LABELS = [
  "persönlich",
  "arbeit",
  "schule",
  "andere",
] as const;
export type EmailLabel = (typeof EMAIL_LABELS)[number] | string;

export interface EmailEntry {
  label: EmailLabel;
  value: string;
}

export const ADDRESS_LABELS = [
  "zuhause",
  "arbeit",
  "andere",
] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number] | string;

export interface AddressEntry {
  label: AddressLabel;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
}

export const SOCIAL_PLATFORMS = [
  "LinkedIn",
  "Instagram",
  "Twitter",
  "GitHub",
  "Mastodon",
  "Bluesky",
  "Threads",
  "TikTok",
  "Website",
  "andere",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number] | string;

export interface SocialEntry {
  platform: SocialPlatform;
  handle_or_url: string;
}

export const DATE_LABELS = [
  "Geburtstag",
  "Hochzeitstag",
  "Jahrestag",
  "andere",
] as const;
export type DateLabel = (typeof DATE_LABELS)[number] | string;

// Lead-time options for date reminders. Stored as days. 0 = day-of,
// 7 = one week before, 14 = two weeks, 30 = one month. Empty list
// when remind is false.
export const REMIND_LEAD_OPTIONS = [
  { value: 0, label: "Am Tag" },
  { value: 1, label: "1 Tag vorher" },
  { value: 3, label: "3 Tage vorher" },
  { value: 7, label: "1 Woche vorher" },
  { value: 14, label: "2 Wochen vorher" },
  { value: 30, label: "1 Monat vorher" },
] as const;

export interface ImportantDate {
  label: DateLabel;
  date: string; // ISO date (YYYY-MM-DD)
  remind: boolean; // create / keep a yearly reminder?
  remind_lead_days?: number; // 0 = same day; 7 = one week before; ignored when remind=false
}

export const RELATIONSHIP_LABELS = [
  "Partner:in",
  "Ehepartner:in",
  "Mutter",
  "Vater",
  "Sohn",
  "Tochter",
  "Bruder",
  "Schwester",
  "Freund:in",
  "Kolleg:in",
  "Mentor:in",
  "andere",
] as const;
export type RelationshipLabel = (typeof RELATIONSHIP_LABELS)[number] | string;

export interface RelationshipEntry {
  related_person_id: string;
  label: RelationshipLabel;
}

// ===== Stakeholder model (Phase 1+2) =====

export const DEPTH_LEVELS = [
  "inner_5",
  "trusted_15",
  "active_50",
  "network_150",
  "periphery_500",
] as const;
export type DepthLevel = (typeof DEPTH_LEVELS)[number];


/** @deprecated use DepthLevel */
export type RelationshipDepth = DepthLevel;
/** @deprecated use DEPTH_LEVELS */
export const RELATIONSHIP_DEPTHS = DEPTH_LEVELS;

export const RELATIONSHIP_WARMTHS = [
  "Aktiv",
  "Warm",
  "Kühl",
  "Kalt",
] as const;
export type RelationshipWarmth = (typeof RELATIONSHIP_WARMTHS)[number];

export const GEO_KINDS = [
  "Wohnort",
  "Aufenthalt",
  "Herkunft",
  "Hub",
] as const;
export type GeoKind = (typeof GEO_KINDS)[number] | string;

export interface GeographyEntry {
  kind: GeoKind;
  place: string;
  since?: string | null; // ISO date / YYYY-MM
  until?: string | null;
}

export const CTA_OPTIONS = [
  "Newsletter",
  "Proposal",
  "Pitchdeck",
  "Meeting",
  "Intro",
  "Nichts",
] as const;
export type CtaValue = (typeof CTA_OPTIONS)[number] | string;

export const PRIORITY_LETTERS = ["A", "B", "C"] as const;
export type PriorityLetter = (typeof PRIORITY_LETTERS)[number];

export const PRIORITY_BUCKETS = [
  "this-week",
  "next-week",
  "later",
] as const;
export type PriorityBucket = (typeof PRIORITY_BUCKETS)[number];

// ===== Service Connections (external MCP-style integrations) =====
// Distinct from the `Connection` interface below which models the
// person-to-person edge graph from the original brief.

export type ServiceConnectionStatus =
  | "pending"
  | "connected"
  | "error"
  | "expired"
  | "disconnected";

export interface ServiceConnection {
  id: string;
  user_id: string;
  provider: string;
  status: ServiceConnectionStatus;
  account_label: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
  config: Record<string, unknown>;
  last_error: string | null;
  connected_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ===== Pipelines =====

export type PipelineEntityType = "person" | "organization" | "both";

export interface PipelineStage {
  id: string;
  name: string;
  color?: string;
  order: number;
  probability?: number; // 0-100
  outcome?: "won" | "lost";
}

export type PipelineFieldType =
  | "text"
  | "number"
  | "date"
  | "currency"
  | "select"
  | "textarea"
  | "url";

export interface PipelineFieldDef {
  key: string;
  label: string;
  type: PipelineFieldType;
  options?: string[];
  required?: boolean;
}

export interface Pipeline {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  entity_type: PipelineEntityType;
  stages: PipelineStage[];
  field_definitions: PipelineFieldDef[];
  default_currency: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type DealStatus = "open" | "won" | "lost";

export interface Deal {
  id: string;
  user_id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  person_id: string | null;
  organization_id: string | null;
  value: number | null;
  currency: string | null;
  expected_close_date: string | null;
  probability: number | null;
  status: DealStatus;
  field_values: Record<string, unknown>;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type WorkflowStatus = "draft" | "enabled" | "disabled";

export type WorkflowNodeKind = "trigger" | "filter" | "transform" | "action";

export interface WorkflowNode {
  id: string;
  type: string; // matches react-flow node renderer key
  position: { x: number; y: number };
  data: {
    kind: WorkflowNodeKind;
    subtype: string; // e.g. "person.created", "filter.scope", "action.create_reminder"
    label: string;
    description?: string;
    config: Record<string, unknown>;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: {
    mappings?: { from: string; to: string }[];
  };
}

export interface Workflow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  // Per-workflow default model per task. Overrides the user's global
  // model_preferences. Per-node config.model_id overrides this in
  // turn. Empty record = inherit user defaults.
  default_model_preferences: Record<string, string>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Organization {
  id: string;
  user_id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
  hq: string | null;
  description: string | null;
  notes: string | null;
  tags: string[];
  enriched_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Person-Modell nach Briefing v3 + Phase A3-A8 + 0024/0025-Cleanup.
//
// Was es einmal gab (Echo Legacy) und 0025 gedroppt hat:
//   scope, stakeholder_types, stakeholder_sub_types, strength_score,
//   depth_override, priority, priority_bucket, priority_set_at, cta,
//   cta_expires_at, interests, tags (text-array), phone (single),
//   email (single), birthday, last_contact_at,
//   cadence_days, next_best_action, notes_summary,
//   geographies, avatar_url, industry, job_function.
// Ersatz: siehe Header in supabase/migrations/0025_legacy_drops.sql.
export interface Person {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  organization_id: string | null;
  role: string | null;
  // Multi-value Kontakt-Channels (JSONB, Echo-Pattern beibehalten).
  phones: PhoneEntry[];
  emails: EmailEntry[];
  addresses: AddressEntry[];
  socials: SocialEntry[];
  important_dates: ImportantDate[];
  relationships: RelationshipEntry[];
  notes: string | null;
  // Freitext-Vorschlag was man dieser Person schenken würde. Optional,
  // 1-Wort bis 1-Satz. UI-Label: "Geschenk".
  gift_idea: string | null;
  is_self: boolean;
  // Goldfeld + Met-Kontext (Briefing 5.1).
  how_we_met: string | null;
  met_date: string | null;
  met_location: string | null;
  met_location_geo: LocationGeo | null;
  // 3-Achsen (Briefing 4.1-4.3).
  depth: Depth | null;
  depth_source: DepthSource;
  purpose: Purpose | null;
  mode: Mode;
  next_nudge_at: string | null;
  last_contact_at: string | null;
  cadence_days: number | null;
  // Profile.
  linkedin_url: string | null;
  photo_url: string | null;
  current_location: string | null;
  current_location_geo: LocationGeo | null;
  home_location: string | null;
  home_location_geo: LocationGeo | null;
  // Custom fields (P1, hybrid jsonb MVP). Values keyed by field-def id;
  // defs live on profiles.custom_field_defs. See lib/custom-fields.ts.
  custom_field_values: CustomFieldValues;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// 0029 — OpenStreetMap (Nominatim) Geo-Daten. Wird optional pro
// Location-Feld gespeichert wenn der Nutzer einen Vorschlag aus dem
// Autocomplete übernimmt. NULL bedeutet freier Text.
export interface LocationGeo {
  display_name: string;
  lat: number;
  lng: number;
  place_id: string;
  osm_type?: string;
  osm_id?: string;
}

// ─────── V3 Strukturierte Tabellen (Migration 0030) ───────────
// Diese drei Tabellen ersetzen langfristig die JSONB-Felder
// phones/emails/socials/relationships sowie die freitext-Location-
// Felder auf people. Phase 1 baut sie parallel auf; Reads/Writes
// migrieren in Phase 2-3.

export const CONTACT_CHANNELS = [
  "email",
  "phone",
  "whatsapp",
  "linkedin",
  "telegram",
  "signal",
  "sms",
  "calendly",
  "website",
  "instagram",
  "twitter",
  "github",
  "mastodon",
  "bluesky",
  "threads",
  "tiktok",
  "other",
] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_SOURCES = [
  "manual",
  "pdl_enrichment",
  "linkedin",
  "vcard_import",
  "voice_extract",
  "ai_suggested",
] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export interface PersonContact {
  id: string;
  user_id: string;
  person_id: string;
  channel: ContactChannel;
  subtype: string | null;
  value: string;
  country_code: string | null;
  is_primary: boolean;
  source: ContactSource;
  created_at: string;
  updated_at: string;
}

export const RELATIONSHIP_TYPES = [
  "introduced_by",
  "colleague",
  "co_founder",
  "mentor",
  "mentee",
  "former_manager",
  "family",
  "friend",
  "investor",
  "advisor",
  "partner",
  "spouse",
  "parent",
  "child",
  "sibling",
  "custom",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export interface PersonRelationship {
  id: string;
  user_id: string;
  person_id: string;
  related_person_id: string;
  relationship_type: RelationshipType;
  label: string | null;
  created_by: "user" | "ai_suggested";
  created_at: string;
}

export const GEO_TYPES = [
  "residence",
  "origin",
  "professional_hub",
  "current_location",
  "met_location",
  "custom",
] as const;
export type GeoType = (typeof GEO_TYPES)[number];

export const GEO_PRECISIONS = ["address", "city", "region", "country"] as const;
export type GeoPrecision = (typeof GEO_PRECISIONS)[number];

export interface PersonGeography {
  id: string;
  user_id: string;
  person_id: string;
  geo_type: GeoType;
  custom_label: string | null;
  is_active: boolean;
  display_name: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  precision: GeoPrecision | null;
  created_at: string;
  updated_at: string;
}

// UI-Helper — Labels (Deutsch) für die neuen Tabellen.

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  email: "Email",
  phone: "Telefon",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  telegram: "Telegram",
  signal: "Signal",
  sms: "SMS",
  calendly: "Calendly",
  website: "Website",
  instagram: "Instagram",
  twitter: "Twitter / X",
  github: "GitHub",
  mastodon: "Mastodon",
  bluesky: "Bluesky",
  threads: "Threads",
  tiktok: "TikTok",
  other: "Anderes",
};

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  introduced_by: "Vermittelt durch",
  colleague: "Kolleg:in",
  co_founder: "Co-Founder:in",
  mentor: "Mentor:in",
  mentee: "Mentee",
  former_manager: "Ex-Vorgesetzte:r",
  family: "Familie",
  friend: "Freund:in",
  investor: "Investor:in",
  advisor: "Advisor",
  partner: "Partner:in",
  spouse: "Ehepartner:in",
  parent: "Elternteil",
  child: "Kind",
  sibling: "Geschwister",
  custom: "Andere",
};

export const GEO_TYPE_LABELS: Record<GeoType, string> = {
  residence: "Wohnsitz",
  origin: "Herkunft",
  professional_hub: "Berufshub",
  current_location: "Aktuell vor Ort",
  met_location: "Wo getroffen",
  custom: "Anderer Ort",
};

export interface Interaction {
  id: string;
  user_id: string;
  person_ids: string[];
  type: InteractionType;
  source: InteractionSource;
  summary: string | null;
  // Transcript des Meetings/Calls. Wird vom +Event-Upload-Pfad
  // automatisch aus text/markdown-Files gefüllt — andere Formate
  // (PDF, Audio) speichern nur das File und lassen transcript leer.
  transcript: string | null;
  sentiment: Sentiment | null;
  topics: string[];
  occurred_at: string;
  created_at: string;
  // Datei-Anhang (Migration 0034). Path im 'life-events' Storage-Bucket.
  file_path: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
}

export interface Note {
  id: string;
  user_id: string;
  person_id: string | null;
  title: string | null;
  body: string | null;
  tags: string[];
  source: NoteSource;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  person_id: string | null;
  text: string;
  remind_at: string;
  recurrence: ReminderRecurrence;
  type: ReminderType;
  status: ReminderStatus;
  source: ReminderSource;
  created_at: string;
}

export interface Todo {
  id: string;
  user_id: string;
  person_id: string | null;
  text: string;
  due_date: string | null;
  priority: TodoPriority;
  status: TodoStatus;
  source_debrief_id: string | null;
  created_at: string;
}

export interface Debrief {
  id: string;
  user_id: string;
  date: string;
  summary: string | null;
  interaction_ids: string[];
  action_ids: string[];
  duration_sec: number | null;
  audio_url: string | null;
  created_at: string;
}

export interface Connection {
  id: string;
  user_id: string;
  from_person_id: string;
  to_person_id: string;
  relationship_type: string | null;
  strength: number | null;
  created_at: string;
}

// — Suggestions (Phase A1, Briefing 3.4) ————————————————————

export type SuggestionType =
  | "tag"
  | "cadence"
  | "cta"
  | "connection"
  | "reconnect"
  | "depth_change"
  | "mode_change"
  | "merge_duplicate"
  | "purpose_mapping"
  | "how_we_met_extract"
  | "field_enrichment";

export type SuggestionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "dismissed";

// `payload` ist absichtlich `Record<string, unknown>` und nicht stark
// typisiert — der Inhalt variiert pro suggestion_type (tag-Suggestion
// hat ein anderes Schema als merge_duplicate). Die akzeptierende Logik
// in lib/suggestion-apply.ts (Phase B) macht Type-Narrowing pro Typ.
export interface SuggestionRow {
  id: string;
  user_id: string;
  person_id: string;
  suggestion_type: SuggestionType;
  payload: Record<string, unknown>;
  reasoning: string | null;
  status: SuggestionStatus;
  created_at: string;
  resolved_at: string | null;
}

// — Tags-System (Briefing v3 Section 19, 0026 Cluster-Wechsel) ———

export type TagCluster = "reminders" | "interests" | "potential" | "origin";

export type TagCreatedBy = "user" | "ai_suggested" | "ai_extracted";

export interface TagRow {
  id: string;
  user_id: string;
  name: string;
  cluster: TagCluster;
  created_by: TagCreatedBy;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface PersonTagRow {
  person_id: string;
  tag_id: string;
  created_at: string;
  // 0028 — pro-Person-Note auf der Junction. Erlaubt Asymmetrie:
  // dasselbe Tag bedeutet bei verschiedenen Personen verschiedenes.
  note: string | null;
}

// Cluster-Editor + Detail-View bekommen Tags angereichert: Tag-Metadaten
// (name, cluster) + die per-Link Note. Aggregiert beim Server-Fetch.
export interface TagWithNote {
  id: string;          // tag_id
  name: string;
  cluster: TagCluster;
  note: string | null; // person-spezifische Note (0028)
}

// UI-Helper — Cluster-Farben für Tag-Chips. Exakte Briefing-v3-Hex-
// Werte (Section 19) statt OKLCH damit das Design-System 1:1 matched.
export const TAG_CLUSTER_COLORS: Record<TagCluster, { bg: string; fg: string }> = {
  reminders: { bg: "#FBEAF0", fg: "#72243E" }, // Pink — Geburtstage/Anker
  interests: { bg: "#E1F5EE", fg: "#085041" }, // Teal — Themen/Skills
  potential: { bg: "#FAEEDA", fg: "#633806" }, // Amber — Give/Get/Both
  origin:    { bg: "#EEEDFE", fg: "#3C3489" }, // Purple — Beziehungs-Herkunft
};

// V3-Anker-Begriffe — bewusst in allen Sprachen Englisch belassen
// damit die Cluster-Identität konstant bleibt (wie Tags, Status, etc.).
export const TAG_CLUSTER_LABELS: Record<TagCluster, string> = {
  reminders: "Signals",
  interests: "Interests",
  potential: "Potential",
  origin: "Origin",
};

// Beschreibungen für Info-Tooltips an Cluster-Section-Headern (V3-Stil).
// Knapp, hilft beim Cluster-Einsortieren ohne dass man Briefing nachlesen muss.
export const TAG_CLUSTER_HINTS: Record<TagCluster, string> = {
  reminders:
    "Wiederkehrende Anker — Geburtstage, Jahrestage, Follow-Up-Termine, Ereignisse die du nicht vergessen willst.",
  interests:
    "Themen + Skills die diese Person bewegen — Sport, Musik, Fachgebiete. Gut um Gemeinsamkeiten zu finden.",
  potential:
    "Was du geben oder holen kannst — Intros, Aufträge, Wissen, Unterstützung. Beides Richtungen.",
  origin:
    "Wo + wie ihr euch begegnet seid — Events, Vermittler, Quellen. Stützt die Reconnect-Story.",
};

// — Passions (Briefing v3 #19, max 5 pro Person, eigene Tabelle) ———

export interface PassionRow {
  id: string;
  user_id: string;
  person_id: string;
  name: string;
  created_at: string;
  note: string | null; // 0028 — frei-Text-Kontext
}

// Visuell rendert sich passion wie ein Tag-Cluster (separate Farben).
export const PASSION_COLOR = { bg: "#F7C1C1", fg: "#501313" }; // Red

// — Circles (Briefing v3 #19, Communities/Organisationen) —————

export interface CircleRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonCircleRow {
  person_id: string;
  circle_id: string;
  added_at: string;
  note: string | null; // 0028 — person-spezifischer Kontext
}

// Cluster-Editor-View: Circle-Stammdaten + per-Person-Note vom Junction.
export interface CircleWithNote {
  id: string;
  name: string;
  description: string | null; // globale Circle-Beschreibung
  note: string | null;        // person-spezifische Note (0028)
}

export const CIRCLE_COLOR = { bg: "#E0EEFB", fg: "#103D6B" }; // Blue

// — 3-Achsen-Klassifizierung (Phase A3-A8, Briefing 4.1-4.3) ————

export type Depth =
  | "inner_5"
  | "trusted_15"
  | "active_50"
  | "network_150"
  | "periphery_500";

export type DepthSource = "auto" | "manual_override";

export type Purpose =
  | "personal"
  | "family"
  | "business_active"
  | "business_latent"
  | "aspirational";

export type Mode =
  | "active"
  | "nurture"
  | "cold"
  | "dormant"
  | "reconnect"
  | "archive";

export type InteractionDirection = "inbound" | "outbound" | "mutual";

// UI-Helper — Labels (deutsch) für die drei Achsen.

export const DEPTH_LABELS: Record<Depth, string> = {
  inner_5: "Inner Circle",
  trusted_15: "Trusted Circle",
  active_50: "Active Circle",
  network_150: "Network",
  periphery_500: "Periphery",
};

export const PURPOSE_LABELS: Record<Purpose, string> = {
  personal: "Personal",
  family: "Family",
  business_active: "Business Active",
  business_latent: "Business Latent",
  aspirational: "Aspirational",
};

export const MODE_LABELS: Record<Mode, string> = {
  active: "Active",
  nurture: "Nurture",
  cold: "Cold",
  dormant: "Dormant",
  reconnect: "Reconnect",
  archive: "Archived",
};

// Section-Header-Beschreibungen für Passions + Circles (V3 Info-Icons).
export const PASSION_HINT =
  "Identitätsstiftende Leidenschaften — was diese Person ausmacht jenseits von Beruf. Max 5 pro Person.";
export const CIRCLE_HINT =
  "Communities + Organisationen die Personen verbinden — Events, Netzwerke, Programme. Hilft Warm-Intros zu finden.";

// Neue Felder für Person. Bewusst SEPARAT vom bestehenden Person-
// Interface — der bestehende Type wird in Phase C erweitert, wenn die
// UI auf die neuen Felder umgestellt wird. Bis dahin können Lib-Funktionen
// die neuen Felder über diesen Wrapper-Type typed lesen.
//
// first_name/last_name/met_event sind raus seit 0024 (v3-Quickwin-Drops).
export interface PersonNewFields {
  how_we_met: string | null;
  met_date: string | null;
  met_location: string | null;
  depth: Depth | null;
  depth_source: DepthSource;
  purpose: Purpose | null;
  mode: Mode;
  next_nudge_at: string | null;
  last_contact_at: string | null;
  cadence_days: number | null;
  linkedin_url: string | null;
  photo_url: string | null;
  current_location: string | null;
  home_location: string | null;
}

// Interactions-Erweiterung (Briefing 8.x)
export interface InteractionNewFields {
  direction: InteractionDirection | null;
  duration_minutes: number | null;
  ai_extracted_facts: Record<string, unknown> | null;
}

// — Life Events (Phase D2, Briefing v3 Section 11) ————————————

export type LifeEventType =
  | "photo"
  | "document"
  | "voice_note"
  | "milestone"
  | "note";

export const LIFE_EVENT_LABELS: Record<LifeEventType, string> = {
  photo: "Foto",
  document: "Dokument",
  voice_note: "Voice-Note",
  milestone: "Meilenstein",
  note: "Notiz",
};

export interface LifeEventRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  event_type: LifeEventType;
  occurred_at: string;
  file_path: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  thumbnail_path: string | null;
  location_name: string | null;
  google_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PersonLifeEventRow {
  person_id: string;
  life_event_id: string;
  added_at: string;
}
