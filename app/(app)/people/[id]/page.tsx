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
import { listContactsForPerson } from "@/lib/person-contacts";
import { listGeographiesForPerson } from "@/lib/person-geographies";
import { listRelationshipsForPerson } from "@/lib/person-relationships";
import { getFieldDefs } from "@/lib/custom-fields.server";
import { parseFieldValues, displayValue } from "@/lib/custom-fields";
import { getCustomDateLabels } from "@/lib/custom-date-labels";
import { GeographiesList } from "@/components/geographies-list";
import {
  AddDateButton,
  AddEventButton,
  AddGeographyButton,
  AddRelationshipButton,
  AddReminderButton,
  AddTodoButton,
  GiftsList,
} from "./inline-section-buttons";
import { listPeople } from "@/lib/people";
import { getProfileDepth } from "@/lib/profile-depth";
import { AxisBadges } from "@/components/axis-badges";
import { ActionBar } from "@/components/action-bar";
import { ChannelsList } from "@/components/channels-list";
import { ShareVCard } from "@/components/share-vcard";
import { DraftGenerator } from "@/components/draft-generator";
import { SuggestionStack } from "./suggestion-stack";
import { ClusterBlock } from "./cluster-block";
import { SynergyTagsButton } from "./synergy-tags-button";
import { LifeEventsBlock } from "./life-events-block";
import { GamificationDashboard } from "./gamification-dashboard";
import { APP_CONFIG } from "@/lib/config";
import { DeleteButton } from "./delete-button";
import { PersonTimeline } from "./timeline";
import { PersonReminders, PersonTodos } from "./person-tasks";
import {
  AddressList,
  DateList,
  RelationshipList,
} from "./contact-fields";
// WhatsappSendBox durch DraftGenerator ersetzt (Phase D1) — alter
// Manual-Composer hatte keine AI-Drafts und keine Use-Case-Templates.
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

// StakeholderView, ClassificationView, hasStakeholderInfo, SCOPE_LABEL und
// RelationshipBadges wurden in 0025 entfernt — die zugehörigen Person-
// Felder (scope, stakeholder_*, industry, job_function, geographies,
// depth_override, priority, cta, strength_score) sind weg.
// Ersatz: AxisBadges (purpose/depth/mode) + suggestions + tags (Cluster).

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

// RelationshipBadges entfernt in 0025 — die Logik (warmth/depth/priority/
// cta) basierte komplett auf gedroppten Legacy-Feldern. Ersatz: AxisBadges
// für depth/purpose/mode + suggestions-Stack für CTAs.

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// One boxed Origin row — label left, value right — matching the
// Stammdaten box format.
function OriginRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-rule-soft px-4 py-2.5 last:border-0">
      <dt className="t-label">{label}</dt>
      <dd className="ml-auto truncate text-sm text-ink-1">{children}</dd>
    </div>
  );
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

  // V3-Migration (0030): Reads laufen auf den strukturierten Tabellen.
  // Erst Beziehungen holen damit wir die related_person_ids haben für
  // den peopleMap-Lookup.
  const [contacts, geographies, relationships] = await Promise.all([
    listContactsForPerson(id),
    listGeographiesForPerson(id, { includeInactive: true }),
    listRelationshipsForPerson(id),
  ]);
  const relatedIds = relationships.map((r) => r.related_person_id);

  const [interactions, notes, reminders, todos, peopleMap, similar, allPeople] =
    await Promise.all([
      listInteractionsForPerson(id),
      listNotesForPerson(id),
      listRemindersForPerson(id),
      listTodosForPerson(id),
      getPeopleMap(relatedIds),
      findSimilarPeople(id, []),
      // Für die +Beziehung-Inline-Form brauchen wir die Liste der
      // anderen Personen für den Picker. Self ist eh ausgefiltert.
      listPeople(),
    ]);
  const candidateRelationshipPeople = allPeople
    .filter((p) => p.id !== id)
    .map((p) => ({ id: p.id, name: p.name }));

  // Custom fields (P1). Defs are per-user; values per-person. Only render
  // the section when at least one def exists AND this person has a value
  // for it (keeps the detail page tidy for sparse data).
  const customFieldDefs = await getFieldDefs();
  const customValues = parseFieldValues(person.custom_field_values);
  const customDateLabels = await getCustomDateLabels();
  const customFieldsToShow = customFieldDefs.filter((d) => {
    const v = customValues[d.id];
    return v !== null && v !== undefined && v !== "" && v !== false;
  });

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
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          href={person.is_self ? "/" : "/people"}
          className="t-label inline-flex items-center hover:text-ink-1"
        >
          ← {person.is_self ? "Zurück" : "Personen"}
        </Link>

        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-5">
            {person.photo_url ? (
              <Image
                src={person.photo_url}
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
              {!person.is_self && (
                <AxisBadges
                  personId={person.id}
                  depth={person.depth}
                  depthSource={person.depth_source}
                  purpose={person.purpose}
                  mode={person.mode}
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
                {/* Legacy text-tags entfernt — tags-Tabelle (Phase A2) liefert die neuen */}
                {([] as string[]).map((t) => (
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
              {!person.is_self && (
                <Link
                  href={`/people/${person.id}/graph`}
                  className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action"
                >
                  Graph
                </Link>
              )}
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

        {showProfileBody && person.is_self && (
          <ShareVCard person={person} contacts={contacts} />
        )}

        {!person.is_self && (
          <ActionBar personId={person.id} contacts={contacts} />
        )}

        {!person.is_self && <SuggestionStack personId={person.id} />}

        {!person.is_self && <ClusterBlock personId={person.id} />}

        {/* Synergien — unter Circles, über Signals (Patrick 2026-06-07). */}
        {!person.is_self && (person.synergies?.length ?? 0) > 0 && (
          <section>
            <div className="section-head">
              <span className="t-label">Synergien</span>
              <span className="rule" />
              <SynergyTagsButton personId={person.id} />
            </div>
            {/* AI-Schlagworte: klickbar → filtert die People-Liste. */}
            {(person.synergy_tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {person.synergy_tags.map((t) => (
                  <Link
                    key={t}
                    href={`/people?synergy=${encodeURIComponent(t.toLowerCase())}`}
                    className="tag transition hover:border-action hover:text-action"
                  >
                    <span className="dot" />
                    {t}
                  </Link>
                ))}
              </div>
            )}
            <ul className="space-y-1.5">
              {person.synergies.map((s, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm leading-relaxed text-ink-1"
                >
                  <span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-action" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Signals — dated events + reminders. Migrated up from the old
            "Wichtige Daten" section (Patrick 2026-06-07): same date/
            reminder logic, now the primary Signals surface near the top. */}
        {showProfileBody && (
          <section>
            <div className="section-head">
              <span className="t-label">Signals</span>
              <span className="rule" />
              {!person.is_self && (
                <AddDateButton
                  personId={person.id}
                  customLabels={customDateLabels}
                />
              )}
            </div>
            <DateList
              dates={person.important_dates ?? []}
              personId={person.id}
            />
          </section>
        )}

        {!person.is_self && (
          <ChannelsList
            contacts={contacts}
            personId={person.id}
            addresses={person.addresses ?? []}
            linkedinUrl={person.linkedin_url}
            currentLocation={person.current_location}
            homeLocation={person.home_location}
          />
        )}

        {/* Origin direkt unter den Stammdaten (Patrick 2026-06-07). */}
        {!person.is_self &&
          (person.how_we_met ||
            person.met_location ||
            person.met_date ||
            person.introduced_by ||
            person.met_with) && (
            <section className="space-y-3">
              <div className="section-head">
                <span className="t-label">Origin</span>
                <span className="rule" />
              </div>
              {/* Boxed rows, gleiche Optik wie Stammdaten. */}
              <dl className="overflow-hidden rounded border border-rule bg-paper">
                {person.how_we_met && (
                  <OriginRow label="Wie">
                    <span className="whitespace-pre-wrap">
                      {person.how_we_met}
                    </span>
                  </OriginRow>
                )}
                {person.met_location && (
                  <OriginRow label="Wo">{person.met_location}</OriginRow>
                )}
                <OriginRow label="Wann">
                  {person.met_date
                    ? new Date(person.met_date).toLocaleDateString("de-DE")
                    : `— (angelegt ${new Date(person.created_at).toLocaleDateString("de-DE")})`}
                </OriginRow>
                {person.introduced_by && (
                  <OriginRow label="Vermittelt">
                    {person.introduced_by_person_id ? (
                      <Link
                        href={`/people/${person.introduced_by_person_id}`}
                        className="text-action hover:underline"
                      >
                        {person.introduced_by}
                      </Link>
                    ) : (
                      person.introduced_by
                    )}
                  </OriginRow>
                )}
                {person.met_with && (
                  <OriginRow label="Mit">
                    {person.met_with_person_id ? (
                      <Link
                        href={`/people/${person.met_with_person_id}`}
                        className="text-action hover:underline"
                      >
                        {person.met_with}
                      </Link>
                    ) : (
                      person.met_with
                    )}
                  </OriginRow>
                )}
              </dl>
            </section>
          )}

        {!person.is_self && (
          <DraftGenerator
            personId={person.id}
            personName={person.name}
            contacts={contacts}
          />
        )}

        {!person.is_self && (
          <GeographiesList
            geographies={geographies.filter(
              (g) => g.geo_type !== "met_location",
            )}
            addSlot={<AddGeographyButton personId={person.id} />}
          />
        )}

        {!person.is_self &&
          (person.primary_language || person.secondary_language) && (
            <section>
              <div className="section-head">
                <span className="t-label">Sprache</span>
                <span className="rule" />
              </div>
              <dl className="kv">
                {person.primary_language && (
                  <div className="contents">
                    <dt>Haupt</dt>
                    <dd>{person.primary_language}</dd>
                  </div>
                )}
                {person.secondary_language && (
                  <div className="contents">
                    <dt>Zweit</dt>
                    <dd>{person.secondary_language}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

        {!person.is_self && <LifeEventsBlock personId={person.id} />}

        {/* Adressen sind jetzt Teil der Stammdaten-Section (oberhalb).
            Multi-Address-Pflege läuft über /people/[id]/edit. Self-
            Profile hat keine Stammdaten-Section, daher hier eingerückt
            nur für self ein Fallback rendern. */}
        {showProfileBody &&
          person.is_self &&
          (person.addresses?.length ?? 0) > 0 && (
            <section>
              <div className="section-head">
                <span className="t-label">Adressen</span>
                <span className="rule" />
              </div>
              <AddressList addresses={person.addresses ?? []} />
            </section>
          )}

        {showProfileBody && (
          <section>
            <div className="section-head">
              <span className="t-label">Beziehungen</span>
              <span className="rule" />
              {!person.is_self && (
                <AddRelationshipButton
                  personId={person.id}
                  candidatePeople={candidateRelationshipPeople}
                />
              )}
            </div>
            <RelationshipList
              relationships={relationships}
              peopleMap={peopleMap}
            />
          </section>
        )}

        {/* Stakeholder/Klassifizierung/Interessen-Sektionen entfernt in 0025
            — die zugehörigen Person-Felder sind weg. Cluster-Funktionalität
            kommt mit Phase c (Tag-Cluster v3) zurück. */}

        {showProfileBody && person.notes && (
          <section>
            <div className="section-head">
              <span className="t-label">Notizen</span>
              <span className="rule" />
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-1">
              {person.notes}
            </p>
          </section>
        )}

        {showProfileBody && !person.is_self && (
          <section>
            <div className="section-head">
              <span className="t-label">Gifts</span>
              <span className="rule" />
            </div>
            {person.gift_idea ? (
              <GiftsList personId={person.id} current={person.gift_idea} />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs italic text-ink-4">
                  Noch keine Geschenkidee — was würdest du dieser Person zum
                  nächsten Anlass schenken?
                </p>
                <GiftsList personId={person.id} current={null} />
              </div>
            )}
          </section>
        )}

        {showProfileBody && person.cadence_days && (
          <section>
            <div className="section-head">
              <span className="t-label">Cadence</span>
              <span className="rule" />
            </div>
            <p className="text-sm text-ink-1">
              alle {person.cadence_days} Tage
            </p>
          </section>
        )}

        {showProfileBody && (
          <div className="grid gap-10 md:grid-cols-2">
            <section>
              <div className="section-head">
                <span className="t-label">Erinnerungen</span>
                <span className="rule" />
                {!person.is_self && <AddReminderButton personId={person.id} />}
              </div>
              <PersonReminders reminders={reminders} />
            </section>

            <section>
              <div className="section-head">
                <span className="t-label">Aufgaben</span>
                <span className="rule" />
                {!person.is_self && <AddTodoButton personId={person.id} />}
              </div>
              <PersonTodos todos={todos} />
            </section>
          </div>
        )}

        {showProfileBody && customFieldsToShow.length > 0 && (
          <section>
            <div className="section-head">
              <span className="t-label">Eigene Felder</span>
              <span className="rule" />
            </div>
            <dl className="kv">
              {customFieldsToShow.map((def) => (
                <div key={def.id} className="contents">
                  <dt>{def.label}</dt>
                  <dd>{displayValue(def, customValues[def.id])}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {showProfileBody && (
          <section>
            <div className="section-head">
              <span className="t-label">Notes</span>
              <span className="rule" />
              {!person.is_self && <AddEventButton personId={person.id} />}
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
