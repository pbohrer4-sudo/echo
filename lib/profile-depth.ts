import type { Person } from "@/lib/types";

// 12 fields beyond the required `name`. Each non-empty value counts as
// one notch toward "complete". Used in person detail header to give
// soft progress feedback — not a quality score, just a completeness
// signal.
const FIELDS = 12;

export function getProfileDepth(person: Person): {
  filled: number;
  total: number;
  percent: number;
} {
  let filled = 0;
  if (person.company) filled += 1;
  if (person.role) filled += 1;
  if ((person.tags ?? []).length > 0) filled += 1;
  if ((person.phones ?? []).length > 0) filled += 1;
  if ((person.emails ?? []).length > 0) filled += 1;
  if ((person.addresses ?? []).length > 0) filled += 1;
  if ((person.socials ?? []).length > 0) filled += 1;
  if ((person.important_dates ?? []).length > 0) filled += 1;
  if ((person.relationships ?? []).length > 0) filled += 1;
  if (person.notes) filled += 1;
  if (person.expected_cadence_days != null) filled += 1;
  if (person.avatar_url) filled += 1;
  return { filled, total: FIELDS, percent: Math.round((filled / FIELDS) * 100) };
}
