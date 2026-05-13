// Shared domain types — kept manual for now. When the schema stabilises,
// switch to `npx supabase gen types typescript` for codegen.

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

export const DEPTH_LABELS: Record<DepthLevel, string> = {
  inner_5: "Inner Circle",
  trusted_15: "Enger Kreis",
  active_50: "Aktiv",
  network_150: "Netzwerk",
  periphery_500: "Peripherie",
};

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

export interface Person {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  organization_id: string | null;
  role: string | null;
  scope: Scope;
  tags: string[];
  expected_cadence_days: number | null;
  strength_score: number | null;
  last_interaction_at: string | null;
  next_best_action: string | null;
  birthday: string | null;
  phone: string | null;
  email: string | null;
  notes_summary: string | null;
  // iPhone-Contacts-style fields (week 4+)
  phones: PhoneEntry[];
  emails: EmailEntry[];
  addresses: AddressEntry[];
  socials: SocialEntry[];
  important_dates: ImportantDate[];
  relationships: RelationshipEntry[];
  avatar_url: string | null;
  notes: string | null;
  is_self: boolean;
  // Phase 1+2 stakeholder model
  stakeholder_types: string[];
  stakeholder_sub_types: Record<string, string[]>;
  geographies: GeographyEntry[];
  industry: string | null;
  job_function: string | null;
  cta: string | null;
  cta_expires_at: string | null;
  priority: PriorityLetter | null;
  priority_bucket: PriorityBucket | null;
  priority_set_at: string | null;
  interests: string[];
  depth: DepthLevel | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Interaction {
  id: string;
  user_id: string;
  person_ids: string[];
  type: InteractionType;
  source: InteractionSource;
  summary: string | null;
  transcript: string | null;
  sentiment: Sentiment | null;
  topics: string[];
  occurred_at: string;
  created_at: string;
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
