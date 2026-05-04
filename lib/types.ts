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

export interface ImportantDate {
  label: DateLabel;
  date: string; // ISO date (YYYY-MM-DD)
  remind: boolean; // create / keep a yearly reminder?
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

export interface Person {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
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
