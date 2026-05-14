import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { findSimilarPeople, getPersonById } from "@/lib/people";
import {
  listInteractionsForPerson,
  listNotesForPerson,
  listRemindersForPerson,
  listTodosForPerson,
  getPeopleMap,
} from "@/lib/inbox";
import { getProfileDepth } from "@/lib/profile-depth";
import { StrengthMeter } from "@/components/strength-meter";
import { GamificationDashboard } from "./gamification-dashboard";
import { relationshipSnapshot, WARMTH_TONE } from "@/lib/relationship";
import { DEPTH_LABELS } from "@/lib/types";
import type { Scope } from "@/lib/types";
import { DeleteButton } from "./delete-button";
import { PersonTimeline } from "./timeline";
import { PersonReminders, PersonTodos } from "./person-tasks";
import {
  AddressList,
  DateList,
  EmailList,
  PhoneList,
  RelationshipList,
  SocialList,
} from "./contact-fields";
import { WhatsappSendBox } from "@/components/whatsapp-send-box";
import { WaAiDraft } from "@/components/wa-ai-draft";
import { createClient } from "@/lib/supabase/server";
import {
  SelfProfileTabs,
  parseSelfTab,
  type SelfTab,
} from "@/components/self-profile-tabs";
import { PaymentsTab } from "@/components/payments-tab";
import { SettingsTab } from "@/components/settings-tab";
import { TabStatusOverview } from "@/components/tab-status-overview";
import {
  getProfileTabStatus,
  getStreaksTabStatus,
  getPaymentsTabStatus,
  getSettingsTabStatus,
  type TabStatus,
} from "@/lib/tab-status";

const SCOPE_LABEL: Record<Scope, string> = {
  work: "Beruflich",
  personal: "Privat",
  both: "Beides",
};

type PersonRecord = import("@/lib/types").Person;

function hasStakeholderInfo(person: PersonRecord): boolean {
  return (
    (person.stakeholder_types?.length ?? 0) > 0 ||
    Object.values(person.stakeholder_sub_types ?? {}).some(
      (arr) => arr.length > 0,
    )
  );
}

function StakeholderView({ person }: { person: PersonRecord }) {
  const types = person.stakeholder_types ?? [];
  const subs = person.stakeholder_sub_types ?? {};
  if (types.length === 0) {
    return <p className="text-sm italic text-ink-3">Keine Stakeholder-Typen.</p>;
  }
  return (
    <ul className="space-y-2">
      {types.map((e1) => {
        const subList = subs[e1] ?? [];
        return (
          <li
            key={e1}
            className="flex flex-wrap items-baseline gap-2 border-b border-rule-soft pb-2 last:border-0"
          >
            <span className="t-label w-32 shrink-0">{e1}</span>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {subList.length === 0 ? (
                <span className="text-xs italic text-ink-4">
                  keine Sub-Typen
                </span>
              ) : (
                subList.map((s) => (
                  <span key={s} className="tag">
                    <span className="dot" />
                    {s}
                  </span>
                ))
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ClassificationView({ person }: { person: PersonRecord }) {
  const fmtMonth = (s: string | null | undefined) => {
    if (!s) return "—";
    const [y, m] = s.split("-");
    if (!y || !m) return s;
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(
      "de-DE",
      { month: "short", year: "numeric" },
    );
  };

  return (
    <div className="space-y-4">
      {(person.industry || person.job_function) && (
        <dl className="kv">
          {person.industry && (
            <>
              <dt>Industrie</dt>
              <dd>{person.industry}</dd>
            </>
          )}
          {person.job_function && (
            <>
              <dt>Funktion</dt>
              <dd>{person.job_function}</dd>
            </>
          )}
        </dl>
      )}
      {(person.geographies?.length ?? 0) > 0 && (
        <ul className="space-y-1.5 text-sm">
          {person.geographies!.map((g, i) => (
            <li
              key={`${g.kind}-${g.place}-${i}`}
              className="flex flex-wrap items-baseline gap-2"
            >
              <span className="t-label w-24 shrink-0">{g.kind}</span>
              <span className="text-ink-1">{g.place}</span>
              {(g.since || g.until) && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
                  {fmtMonth(g.since)}
                  {g.until ? ` – ${fmtMonth(g.until)}` : g.since ? " – heute" : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProfileDepthBar({ person }: { person: import("@/lib/types").Person }) {
  const depth = getProfileDepth(person);
  return (
    <div className="flex w-40 flex-col items-end gap-1">
      <span className="t-label">
        Profil {depth.filled}/{depth.total}
      </span>
      <div className="h-1.5 w-full rounded bg-paper-3">
        <div
          className="h-full rounded bg-action transition-all"
          style={{ width: `${depth.percent}%` }}
        />
      </div>
    </div>
  );
}

function ActionBar({ phones }: { phones: import("@/lib/types").PhoneEntry[] }) {
  const raw = phones[0]?.value ?? "";
  const e164 = raw.replace(/\s+/g, "");

  return (
    <div className="flex gap-2 py-3">
      <a
        href={`tel:${e164}`}
        className="flex h-9 flex-1 items-center justify-center gap-2 rounded border border-transparent text-sm font-medium text-paper transition hover:opacity-90"
        style={{ background: "oklch(28% 0.04 250)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.44 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17z"/></svg>
        Anrufen
      </a>
      <a
        href={`https://wa.me/${e164.replace(/^\+/, "")}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-9 flex-1 items-center justify-center gap-2 rounded border border-transparent text-sm font-medium text-paper transition hover:opacity-90"
        style={{ background: "#25D366" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.004 2.003C6.473 2.003 2 6.474 2 12.004c0 1.774.463 3.44 1.27 4.895L2 22l5.233-1.252A9.966 9.966 0 0 0 12.004 22C17.535 22 22 17.529 22 12.004c0-5.529-4.465-10.001-9.996-10.001zm0 18.18a8.16 8.16 0 0 1-4.146-1.131l-.297-.176-3.077.735.783-2.998-.194-.308A8.14 8.14 0 0 1 3.82 12.004c0-4.52 3.676-8.198 8.184-8.198 4.504 0 8.18 3.678 8.18 8.198 0 4.52-3.676 8.179-8.18 8.179z"/></svg>
        WhatsApp
      </a>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded border border-rule text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
        title="Mehr Optionen"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
      </button>
    </div>
  );
}

function RelationshipBadges({
  person,
  interactionCount,
}: {
  person: import("@/lib/types").Person;
  interactionCount: number;
}) {
  const snap = relationshipSnapshot(person, interactionCount);
  const tone = WARMTH_TONE[snap.warmth];

  const PRIORITY_LABEL: Record<string, string> = {
    "this-week": "Diese Woche",
    "next-week": "Nächste Woche",
    later: "Später",
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Wärme */}
      <span
        className="tag"
        style={{
          background: tone.chipBg,
          borderColor: tone.chipBorder,
          color: tone.text,
        }}
      >
        <span className="dot" style={{ background: tone.dot }} />
        {snap.warmth}
      </span>

      {/* Tiefe — manual override gets a different visual marker */}
      <span
        className="tag"
        title={
          person.depth
            ? `Manuell gesetzt — Auto wäre ${DEPTH_LABELS[snap.depth]}`
            : "Aus Interaktionen berechnet"
        }
      >
        <span className="dot" />
        {DEPTH_LABELS[snap.depth]}
        {person.depth && (
          <span className="ml-1 font-mono text-[8px] uppercase tracking-wider text-ink-4">
            manual
          </span>
        )}
      </span>

      {/* Priorität */}
      {snap.priority && (
        <span
          className="tag"
          style={{
            borderColor: "var(--action)",
            color: "var(--action)",
          }}
        >
          <span className="dot" style={{ background: "var(--action)" }} />
          Priorität {snap.priority}
        </span>
      )}
      {snap.priorityBucket && (
        <span
          className="tag"
          title={
            snap.priorityDecayed
              ? "Auto-Decay: Bucket ist aus dem Set-Datum vorgerückt"
              : undefined
          }
        >
          <span className="dot" />
          {PRIORITY_LABEL[snap.priorityBucket]}
          {snap.priorityDecayed && (
            <span className="ml-1 font-mono text-[8px] uppercase tracking-wider text-ink-4">
              decayed
            </span>
          )}
        </span>
      )}

      {/* CTA */}
      {snap.ctaActive && person.cta && (
        <span
          className="tag"
          style={{
            background: "oklch(96% 0.04 80)",
            borderColor: "oklch(72% 0.13 75)",
            color: "oklch(40% 0.10 75)",
          }}
        >
          <span
            className="dot"
            style={{ background: "oklch(72% 0.13 75)" }}
          />
          CTA: {person.cta}
        </span>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function PersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { tab, saved, error: flashError } = await searchParams;
  const person = await getPersonById(id);
  if (!person) notFound();

  // Tab state is only meaningful for the self profile. For other
  // people we always render the full flat layout — they don't have
  // streaks / payments / settings tabs.
  const activeTab: SelfTab = person.is_self
    ? parseSelfTab(tab)
    : "profile";

  const relatedIds = (person.relationships ?? []).map(
    (r) => r.related_person_id,
  );

  // Load user profile for message_style preference (used by WaAiDraft).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profileRow } = user
    ? await supabase
        .from("profiles")
        .select("message_style")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const messageStyle: "locker" | "professionell" =
    profileRow?.message_style === "professionell" ? "professionell" : "locker";

  const [interactions, notes, reminders, todos, peopleMap, similar] =
    await Promise.all([
      listInteractionsForPerson(id),
      listNotesForPerson(id),
      listRemindersForPerson(id),
      listTodosForPerson(id),
      getPeopleMap(relatedIds),
      findSimilarPeople(id, person.tags ?? []),
    ]);

  // Sub-flags so the JSX stays readable. For non-self people, every
  // section renders as before. For self, sections are scoped to the
  // active tab.
  const showProfileBody = !person.is_self || activeTab === "profile";
  const showStreaksTab = person.is_self && activeTab === "streaks";
  const showPaymentsTab = person.is_self && activeTab === "payments";
  const showSettingsTab = person.is_self && activeTab === "settings";

  // Status overview per tab. Only compute the one we'll actually
  // render so non-active tabs don't pay for their queries.
  let tabStatus: TabStatus | null = null;
  if (person.is_self) {
    if (activeTab === "profile")
      tabStatus = await getProfileTabStatus(person);
    else if (activeTab === "streaks") tabStatus = await getStreaksTabStatus();
    else if (activeTab === "payments")
      tabStatus = await getPaymentsTabStatus();
    else if (activeTab === "settings")
      tabStatus = await getSettingsTabStatus();
  }

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-10">
        <Link
          href={person.is_self ? "/" : "/people"}
          className="t-label inline-flex items-center hover:text-ink-1"
        >
          ← {person.is_self ? "Zurück" : "Personen"}
        </Link>

        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-5">
            {person.avatar_url ? (
              <Image
                src={person.avatar_url}
                alt={person.name}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover ring-1 ring-rule"
                unoptimized
              />
            ) : (
              <span className="avatar lg" aria-hidden>
                {initials(person.name)}
              </span>
            )}
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
                {person.name}
              </h1>
              {(person.role || person.company) && (
                <p className="text-sm text-ink-3">
                  {person.role && <span>{person.role}</span>}
                  {person.role && person.company && (
                    <span> · </span>
                  )}
                  {person.company &&
                    (person.organization_id ? (
                      <Link
                        href={`/organizations/${person.organization_id}`}
                        className="transition hover:text-action"
                      >
                        {person.company}
                      </Link>
                    ) : (
                      <span>{person.company}</span>
                    ))}
                </p>
              )}
              {!person.is_self && (person.strength_score ?? 0) > 0 && (
                <StrengthMeter value={person.strength_score ?? 0} />
              )}
              {!person.is_self && (
                <RelationshipBadges
                  person={person}
                  interactionCount={interactions.length}
                />
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {person.is_self && (
                  <span
                    className="tag"
                    style={{
                      borderColor: "var(--action)",
                      color: "var(--action)",
                    }}
                  >
                    Mein Profil
                  </span>
                )}
                <span className="tag">
                  <span className="dot" />
                  {SCOPE_LABEL[person.scope]}
                </span>
                {(person.tags ?? []).map((t) => (
                  <Link
                    key={t}
                    href={`/people?tag=${encodeURIComponent(t)}`}
                    className="tag transition hover:border-action hover:text-action"
                  >
                    <span className="dot" />
                    {t}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2">
              <Link
                href={`/people/${person.id}/edit`}
                className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
              >
                Bearbeiten
              </Link>
              {!person.is_self && (
                <DeleteButton id={person.id} name={person.name} />
              )}
            </div>
            <ProfileDepthBar person={person} />
          </div>
        </div>

        {!person.is_self && (person.phones ?? []).length > 0 && (
          <ActionBar phones={person.phones} />
        )}

        {person.is_self && (
          <SelfProfileTabs personId={person.id} activeTab={activeTab} />
        )}

        {/* Tab content animates in on every tab change. The
            animate-in + slide-in classes come from tw-animate-css
            (already imported globally). */}
        {showStreaksTab && (
          <div
            key="tab-streaks"
            className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-8"
          >
            {tabStatus && <TabStatusOverview status={tabStatus} />}
            <section>
              <div className="section-head">
                <span className="t-label">Streaks · Erfolge · XP</span>
                <span className="rule" />
              </div>
              <GamificationDashboard />
            </section>
          </div>
        )}

        {showPaymentsTab && (
          <div
            key="tab-payments"
            className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-8"
          >
            {tabStatus && (
              <TabStatusOverview
                status={tabStatus}
                emptyLabel="Payments läuft noch nicht — keine Signale."
              />
            )}
            <PaymentsTab />
          </div>
        )}

        {showSettingsTab && (
          <div
            key="tab-settings"
            className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-8"
          >
            {tabStatus && <TabStatusOverview status={tabStatus} />}
            <SettingsTab
              selfPersonId={person.id}
              flash={{ saved, error: flashError }}
            />
          </div>
        )}

        {showProfileBody && person.is_self && tabStatus && (
          <div
            key="tab-profile-status"
            className="animate-in fade-in slide-in-from-top-2 duration-300"
          >
            <TabStatusOverview status={tabStatus} />
          </div>
        )}

        {showProfileBody && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300 grid gap-10 md:grid-cols-2">
            <section className="space-y-3">
              <div className="section-head">
                <span className="t-label">Telefon</span>
                <span className="rule" />
              </div>
              <PhoneList phones={person.phones ?? []} />
              <WhatsappSendBox
                personId={person.id}
                phones={person.phones ?? []}
              />
            </section>

            <section>
              <div className="section-head">
                <span className="t-label">Email</span>
                <span className="rule" />
              </div>
              <EmailList emails={person.emails ?? []} />
            </section>
          </div>
        )}

        {showProfileBody && (person.addresses?.length ?? 0) > 0 && (
          <section>
            <div className="section-head">
              <span className="t-label">Adressen</span>
              <span className="rule" />
            </div>
            <AddressList addresses={person.addresses ?? []} />
          </section>
        )}

        {showProfileBody && (person.socials?.length ?? 0) > 0 && (
          <section>
            <div className="section-head">
              <span className="t-label">Social</span>
              <span className="rule" />
            </div>
            <SocialList socials={person.socials ?? []} />
          </section>
        )}

        {showProfileBody && (
          <div className="grid gap-10 md:grid-cols-2">
            <section>
              <div className="section-head">
                <span className="t-label">Wichtige Daten</span>
                <span className="rule" />
              </div>
              <DateList
                dates={person.important_dates ?? []}
                personId={person.id}
              />
            </section>

            <section>
              <div className="section-head">
                <span className="t-label">Beziehungen</span>
                <span className="rule" />
              </div>
              <RelationshipList
                relationships={person.relationships ?? []}
                peopleMap={peopleMap}
              />
            </section>
          </div>
        )}

        {!person.is_self && hasStakeholderInfo(person) && (
          <section>
            <div className="section-head">
              <span className="t-label">Stakeholder</span>
              <span className="rule" />
            </div>
            <StakeholderView person={person} />
          </section>
        )}

        {!person.is_self &&
          ((person.geographies?.length ?? 0) > 0 ||
            person.industry ||
            person.job_function) && (
            <section>
              <div className="section-head">
                <span className="t-label">Klassifizierung & Orte</span>
                <span className="rule" />
              </div>
              <ClassificationView person={person} />
            </section>
          )}

        {!person.is_self && (person.phones ?? []).length > 0 && (
          <WaAiDraft
            person={{ id: person.id, name: person.name }}
            phones={person.phones ?? []}
            defaultStyle={messageStyle}
          />
        )}

        {!person.is_self && (person.interests?.length ?? 0) > 0 && (
          <section>
            <div className="section-head">
              <span className="t-label">Interessen & Synergien</span>
              <span className="rule" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {person.interests!.map((t) => (
                <span key={t} className="tag">
                  <span className="dot" />
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

        {showProfileBody && (person.notes || person.notes_summary) && (
          <section>
            <div className="section-head">
              <span className="t-label">Notizen</span>
              <span className="rule" />
            </div>
            {person.notes && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-1">
                {person.notes}
              </p>
            )}
            {person.notes_summary && (
              <div className="mt-4 rounded border border-rule-soft bg-paper-2 p-4">
                <p className="t-label mb-2">ECHO-Zusammenfassung</p>
                <p className="text-sm text-ink-2">{person.notes_summary}</p>
              </div>
            )}
          </section>
        )}

        {showProfileBody && person.expected_cadence_days && (
          <section>
            <div className="section-head">
              <span className="t-label">Cadence</span>
              <span className="rule" />
            </div>
            <p className="text-sm text-ink-1">
              alle {person.expected_cadence_days} Tage
            </p>
          </section>
        )}

        {showProfileBody && (
          <div className="grid gap-10 md:grid-cols-2">
            <section>
              <div className="section-head">
                <span className="t-label">Erinnerungen</span>
                <span className="rule" />
              </div>
              <PersonReminders reminders={reminders} />
            </section>

            <section>
              <div className="section-head">
                <span className="t-label">Aufgaben</span>
                <span className="rule" />
              </div>
              <PersonTodos todos={todos} />
            </section>
          </div>
        )}

        {showProfileBody && (
          <section>
            <div className="section-head">
              <span className="t-label">Timeline</span>
              <span className="rule" />
            </div>
            <PersonTimeline interactions={interactions} notes={notes} />
          </section>
        )}

        {showProfileBody && similar.length > 0 && (
          <section>
            <div className="section-head">
              <span className="t-label">Ähnliche Personen</span>
              <span className="rule" />
            </div>
            <ul className="space-y-2">
              {similar.map(({ person: p, shared }) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-4"
                >
                  <Link
                    href={`/people/${p.id}`}
                    className="text-sm text-ink-1 transition hover:text-action"
                  >
                    {p.name}
                  </Link>
                  <span className="flex flex-wrap gap-1">
                    {shared.map((t) => (
                      <Link
                        key={t}
                        href={`/people?tag=${encodeURIComponent(t)}`}
                        className="tag transition hover:border-action hover:text-action"
                      >
                        <span className="dot" />
                        {t}
                      </Link>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
