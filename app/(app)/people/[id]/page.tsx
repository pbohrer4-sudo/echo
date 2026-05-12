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
import { AxisBadges } from "@/components/axis-badges";
import { GamificationDashboard } from "./gamification-dashboard";
import { relationshipSnapshot, WARMTH_TONE } from "@/lib/relationship";
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
          person.depth_override
            ? `Manuell gesetzt — Auto wäre ${snap.depth}`
            : "Aus Interaktionen berechnet"
        }
      >
        <span className="dot" />
        {snap.depth}
        {person.depth_override && (
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
                <AxisBadges
                  personId={person.id}
                  depth={person.depth}
                  depthSource={person.depth_source}
                  purpose={person.purpose}
                  mode={person.mode}
                />
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
