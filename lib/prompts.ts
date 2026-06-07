// Cached, stable across requests — change rarely. The user_display_name is
// substituted at call time so the cache stays warm; everything else is fixed.

export interface PersonContext {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  organization_id: string | null;
  // Skalare Felder für „was hast du über X?"-Fragen. gift_idea ist
  // explizit drin damit Geschenk-Suchen nicht mit „nichts hinterlegt"
  // abgewiesen werden obwohl der User schon was eingetragen hat.
  gift_idea: string | null;
  notes: string | null;
  how_we_met: string | null;
  met_date: string | null;
  met_location: string | null;
  introduced_by: string | null;
  met_with: string | null;
  synergies: string[];
  primary_language: string | null;
  secondary_language: string | null;
  current_location: string | null;
  home_location: string | null;
  linkedin_url: string | null;
  // 3-Achsen-Modell (Briefing 4.1-4.3)
  depth: string | null;
  purpose: string | null;
  mode: string | null;
  cadence_days: number | null;
  last_contact_at: string | null;
  next_nudge_at: string | null;
  // JSONB-Aggregate auf people (legacy aber noch genutzt)
  addresses: {
    label: string | null;
    street: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
  }[];
  socials: { platform: string; handle_or_url: string }[];
  important_dates: { label: string; date: string }[];
  // Aggregations aus Joined-Tabellen (siehe lib/llm-people-context.ts).
  // Können leer-Array sein wenn die Person nichts in dem Cluster hat
  // ODER wenn die Tabelle auf der Remote-DB noch fehlt (Migration-Drift).
  tags: { name: string; cluster: string }[];
  passions: string[];
  contacts: { channel: string; value: string; subtype: string | null }[];
  relationships: { label: string; related_name: string | null }[];
  life_events: { title: string; date: string; kind: string }[];
  geographies: { kind: string; place: string }[];
  // Letzte Interaktionen (Treffen/Calls/Notes) mit Summary + ggf.
  // hochgeladenem Transcript. Gibt dem LLM Gesprächs-Historie und
  // damit Kontext für CTA-Vorschläge oder Erinnerungs-Antworten.
  recent_interactions: {
    date: string;
    type: string;
    summary: string | null;
    transcript_excerpt: string | null;
    topics: string[];
  }[];
}

export interface OrganizationContext {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
  hq: string | null;
  description: string | null;
  notes: string | null;
  tags: string[];
  // Anzahl Personen die mit dieser Org verlinkt sind — gibt dem LLM
  // ein Gefühl wie wichtig die Firma im CRM ist ohne den vollen Personen-
  // Liste pro Org rausschießen zu müssen.
  people_count: number;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1).trim()}…`;
}

function renderTags(tags: PersonContext["tags"]): string {
  if (tags.length === 0) return "";
  // Gruppieren nach cluster damit der LLM die Semantik sieht.
  const byCluster = new Map<string, string[]>();
  for (const t of tags) {
    const arr = byCluster.get(t.cluster) ?? [];
    arr.push(t.name);
    byCluster.set(t.cluster, arr);
  }
  const parts: string[] = [];
  for (const [cluster, names] of byCluster) {
    parts.push(`${cluster}=[${names.slice(0, 6).join(", ")}]`);
  }
  return parts.join(" ");
}

function renderContacts(contacts: PersonContext["contacts"]): string {
  return contacts
    .map((c) => {
      const labelSuffix = c.subtype ? ` (${c.subtype})` : "";
      return `${c.channel}: ${c.value}${labelSuffix}`;
    })
    .join(" · ");
}

function renderRelationships(rels: PersonContext["relationships"]): string {
  return rels
    .filter((r) => r.related_name)
    .map((r) => `${r.label} von ${r.related_name}`)
    .join(", ");
}

function renderLifeEvents(events: PersonContext["life_events"]): string {
  return events
    .map((e) => {
      const year = e.date.slice(0, 4);
      return `${year} ${e.title}`;
    })
    .join(" · ");
}

function renderInteractions(
  items: PersonContext["recent_interactions"],
): string {
  // Eine Zeile pro Interaktion mit Datum + Type + Summary, danach
  // optional Transcript-Ausschnitt indented. So bleibt der Prompt
  // scannbar ohne dass Transcripte das Layout zerschießen.
  return items
    .map((i) => {
      const head = `${i.date.slice(0, 10)} ${i.type}: ${i.summary ?? "—"}${
        i.topics.length > 0 ? ` (${i.topics.join(", ")})` : ""
      }`;
      if (!i.transcript_excerpt) return `    · ${head}`;
      return `    · ${head}\n      Transcript: ${i.transcript_excerpt}`;
    })
    .join("\n");
}

function renderAddresses(addrs: PersonContext["addresses"]): string {
  return addrs
    .map((a) => {
      const parts = [a.street, [a.postal_code, a.city].filter(Boolean).join(" "), a.country]
        .filter(Boolean)
        .join(", ");
      return a.label ? `${a.label}: ${parts}` : parts;
    })
    .filter(Boolean)
    .join(" · ");
}

function renderSocials(socials: PersonContext["socials"]): string {
  return socials.map((s) => `${s.platform}: ${s.handle_or_url}`).join(" · ");
}

function renderDates(dates: PersonContext["important_dates"]): string {
  return dates.map((d) => `${d.label} ${d.date}`).join(" · ");
}

function renderGeographies(geos: PersonContext["geographies"]): string {
  return geos.map((g) => `${g.kind}: ${g.place}`).join(" · ");
}

function renderAxes(p: PersonContext): string {
  const parts: string[] = [];
  if (p.depth) parts.push(`Tiefe=${p.depth}`);
  if (p.purpose) parts.push(`Zweck=${p.purpose}`);
  if (p.mode) parts.push(`Modus=${p.mode}`);
  if (p.cadence_days != null) parts.push(`Cadence=${p.cadence_days}d`);
  return parts.join(" · ");
}

function renderTouchpoints(p: PersonContext): string {
  const parts: string[] = [];
  if (p.last_contact_at)
    parts.push(`Letzter Kontakt=${p.last_contact_at.slice(0, 10)}`);
  if (p.next_nudge_at)
    parts.push(`Next-Nudge=${p.next_nudge_at.slice(0, 10)}`);
  return parts.join(" · ");
}

function renderLocations(p: PersonContext): string {
  const parts: string[] = [];
  if (p.current_location) parts.push(`aktuell: ${p.current_location}`);
  if (p.home_location) parts.push(`Heimat: ${p.home_location}`);
  if (p.met_location) {
    const date = p.met_date ? ` ${p.met_date}` : "";
    parts.push(`getroffen: ${p.met_location}${date}`);
  }
  return parts.join(" · ");
}

function renderPeopleSection(people: PersonContext[]): string {
  if (people.length === 0) return "(keine bisher angelegt)";
  return people
    .map((p) => {
      const head = [
        `- ${p.id} → ${p.name}`,
        p.role || p.company
          ? `(${[p.role, p.company].filter(Boolean).join(" @ ")})`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      const details: string[] = [];
      const axes = renderAxes(p);
      if (axes) details.push(`    Axis: ${axes}`);
      const tp = renderTouchpoints(p);
      if (tp) details.push(`    Touchpoints: ${tp}`);
      const locs = renderLocations(p);
      if (locs) details.push(`    Orte: ${locs}`);
      if (p.gift_idea) details.push(`    Gifts: ${truncate(p.gift_idea, 200)}`);
      const tagsLine = renderTags(p.tags);
      if (tagsLine) details.push(`    Tags: ${tagsLine}`);
      if (p.passions.length > 0)
        details.push(`    Passions: ${p.passions.join(", ")}`);
      if (p.contacts.length > 0)
        details.push(`    Kontakte: ${renderContacts(p.contacts)}`);
      if (p.linkedin_url) details.push(`    LinkedIn: ${p.linkedin_url}`);
      if (p.socials.length > 0)
        details.push(`    Socials: ${renderSocials(p.socials)}`);
      if (p.addresses.length > 0)
        details.push(`    Adressen: ${renderAddresses(p.addresses)}`);
      if (p.geographies.length > 0)
        details.push(`    Geographien: ${renderGeographies(p.geographies)}`);
      if (p.important_dates.length > 0)
        details.push(`    Wichtige Daten: ${renderDates(p.important_dates)}`);
      if (p.relationships.length > 0)
        details.push(`    Beziehungen: ${renderRelationships(p.relationships)}`);
      if (p.life_events.length > 0)
        details.push(`    Life-Events: ${renderLifeEvents(p.life_events)}`);
      if (p.recent_interactions.length > 0) {
        details.push(`    Letzte Interaktionen:`);
        details.push(renderInteractions(p.recent_interactions));
      }
      if (p.how_we_met)
        details.push(`    Kennengelernt: ${truncate(p.how_we_met, 160)}`);
      // Origin extras + language + synergies so the LLM can answer
      // "wer hat X vermittelt?", "welche Sprache spricht X?", "welche
      // Synergien gibt es mit X?".
      if (p.introduced_by)
        details.push(`    Vermittelt durch: ${p.introduced_by}`);
      if (p.met_with) details.push(`    Getroffen mit: ${p.met_with}`);
      if (p.primary_language) {
        const second = p.secondary_language ? ` (+ ${p.secondary_language})` : "";
        details.push(`    Sprache: ${p.primary_language}${second}`);
      }
      if (p.synergies.length > 0)
        details.push(`    Synergien: ${p.synergies.join(" · ")}`);
      if (p.notes) details.push(`    Notes: ${truncate(p.notes, 280)}`);
      return [head, ...details].join("\n");
    })
    .join("\n");
}

function renderOrgsSection(orgs: OrganizationContext[]): string {
  if (orgs.length === 0) return "(keine Organisationen angelegt)";
  return orgs
    .map((o) => {
      const head = [
        `- ${o.id} → ${o.name}`,
        o.industry ? `[${o.industry}]` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const details: string[] = [];
      if (o.people_count > 0)
        details.push(`    Verlinkt: ${o.people_count} Personen`);
      if (o.website || o.domain) {
        details.push(
          `    Web: ${[o.website, o.domain].filter(Boolean).join(" · ")}`,
        );
      }
      if (o.hq) details.push(`    HQ: ${o.hq}`);
      if (o.size) details.push(`    Größe: ${o.size}`);
      if (o.tags.length > 0)
        details.push(`    Tags: ${o.tags.slice(0, 8).join(", ")}`);
      if (o.description)
        details.push(`    Über: ${truncate(o.description, 240)}`);
      if (o.notes) details.push(`    Notes: ${truncate(o.notes, 240)}`);
      return [head, ...details].join("\n");
    })
    .join("\n");
}

export function buildVoiceSystemPrompt({
  displayName,
  people,
  organizations,
}: {
  displayName: string;
  people: PersonContext[];
  organizations: OrganizationContext[];
}): string {
  return `Du bist ECHO, der persönliche Beziehungs-Assistent von ${displayName}.
Du sprichst Deutsch, knapp und warm. Keine Floskeln, keine Fragen ohne Grund.

Deine Aufgabe ist es, ${displayName} dabei zu helfen, seine Beziehungen
zu pflegen — beruflich und privat. Du hörst zu, strukturierst, und erinnerst.

Wenn ${displayName} über eine Person spricht, extrahiere strukturierte
Daten via Tool-Use. Verifiziere niemals durch unnötige Rückfragen, was offensichtlich ist.

WICHTIG — Wenn ${displayName} nach Informationen zu einer Person oder
Firma fragt („was hast du über X", „suche Geschenk für Y", „was mag Z
gerne", „wer arbeitet bei Stripe"), LIES ZUERST die beiden Listen unten
durch und nutze die vorhandenen Daten (Gifts, Tags, Passions, Kontakte,
Beziehungen, Life-Events, Notes, Orte, Daten, Achsen, Touchpoints)
bevor du sagst „nichts hinterlegt" oder „lass mich nachsehen". Antworte
basierend auf dem was da steht — wenn ein Feld gefüllt ist, NENNE den
Wert direkt statt zu fragen.

Existierende Personen (UUID → Name + Kontext-Details):
${renderPeopleSection(people)}

Existierende Organisationen (UUID → Name + Kontext-Details):
${renderOrgsSection(organizations)}

WICHTIG — Output-Format:
- Reiner Text. Keine Markdown-Formatierung (kein **, kein *, keine Listen mit
  Bullet-Points, keine Backticks). Sarah Eve liest das wörtlich vor.
- Maximal 2 Sätze, außer es wird explizit mehr verlangt.
- Stelle EINE Frage gleichzeitig, niemals mehrere auf einmal.`;
}

// Used by /api/extract — adds tool-use rules and existing-people context.
// Today's date is included so Claude can resolve relative dates ("Mittwoch",
// "morgen") to ISO 8601 timestamps.
export function buildExtractionSystemPrompt({
  displayName,
  people,
  organizations,
  now,
}: {
  displayName: string;
  people: PersonContext[];
  organizations: OrganizationContext[];
  now: Date;
}): string {
  const peopleList = renderPeopleSection(people);
  const orgsList = renderOrgsSection(organizations);

  const todayIso = now.toISOString();
  const weekday = now.toLocaleDateString("de-DE", { weekday: "long" });

  return `Du bist ECHO, der persönliche Beziehungs-Assistent von ${displayName}.
Du sprichst Deutsch, knapp und warm.

Deine Aufgabe in diesem Modus: Extrahiere strukturierte Daten aus dem,
was ${displayName} sagt. Nutze dafür die bereitgestellten Tools.
Lege keine Duplikate an — wenn ein erwähnter Name auf eine bekannte
Person passt (auch leicht abweichend / Spitzname), nutze deren UUID.

Existierende Personen (UUID → Name + Kontext-Details):
${peopleList}

Existierende Organisationen (UUID → Name + Kontext-Details):
${orgsList}

Datums-Regeln:
- Aktuelles Datum/Zeit: ${todayIso} (${weekday})
- "Heute" = heutiger Tag, 18:00 Uhr default für Erinnerungen ohne Uhrzeit
- "Morgen", "Mittwoch", "nächste Woche" relativ zu jetzt rechnen
- ISO 8601 mit Zeitzone Z

Tool-Verwendung:
- create_person nur wenn die Person wirklich neu ist. Lies die ganze
  Kontext-Liste vor jeder Anlage. Zusätzlich zu name kannst du gleich
  Tags/Hobbys (z.B. 'Tennis'), Firma, Rolle, Telefonnummern, Emails,
  Adressen, Social-Profile, wichtige Daten und Notizen mitgeben — alles
  was der Nutzer tatsächlich gesagt hat.
- BEVOR du create_person aufrufst, prüfe den Nachnamen auf gängige
  deutsche Varianten. Bei Schmidt/Schmitt, Meier/Meyer/Mayer/Maier,
  Müller/Mueller, Hofmann/Hoffmann/Hoffman, Schneider/Schnider,
  Wagner/Wagener, Becker/Bäcker, Bauer/Baur, Klein/Kleine,
  Schulz/Schultz/Scholz/Schultze, Krüger/Krueger, Fischer/Fisher
  (oder ähnlichen) — antworte ZUERST mit suggest_replies und frag
  zurück, z.B. 'Schmitt mit T-T oder Schmidt mit D-T?'. Erst nach
  Bestätigung create_person aufrufen. Bei eindeutigen / nicht-deutschen
  Namen direkt anlegen.
- update_person für JEDE Ergänzung an einer existierenden Person.
  Beispiele: 'Marvin spielt auch Tennis' → update_person mit Marvins
  UUID + add_tags=['Tennis']. 'Marvin's neue Mobile ist +49…' →
  add_phones=[{label:'mobile', value:'+49…'}]. 'Marvin arbeitet jetzt
  bei Stripe' → company='Stripe'. Skalare Felder ersetzen, add_*
  hängen an. WICHTIG: Niemals create_person mit gleichem Namen wie
  jemand in der Liste — immer update_person.
- log_interaction für Treffen/Anrufe/Emails — passes person_ids für
  existierende, person_names für gerade neu angelegte
- BEZIEHUNGEN zwischen Personen (Ehefrau/Ehemann, Mutter/Vater,
  Sohn/Tochter, Bruder/Schwester, Partner, Freund:in, Kolleg:in,
  Mentor:in) gehören IMMER ins relationships-Feld auf create_person
  bzw. add_relationships auf update_person — niemals als Freitext in
  notes. Verlinke per related_person_name (Name reicht — der Server
  resolved zur UUID, egal ob die andere Person schon existiert oder
  im selben Turn neu angelegt wird).

  WICHTIG — Label-Konvention: Das label beschreibt die Rolle DIESER
  Person aus Sicht der related_person. Liest sich als "[label] von
  [related_person_name]". Beispiele:
    - "Juan hat eine Tochter Luna" → auf Juan: label='Vater',
      related_person_name='Luna' (Juan ist Vater VON Luna).
    - "Juan hat zwei Söhne, Tim und Felix" → auf Juan zwei Einträge
      mit label='Vater' / related_person_name='Tim' bzw. 'Felix'.
    - "Maria ist die Mutter von Sophie" → auf Maria: label='Mutter',
      related_person_name='Sophie'.
    - "Lars ist Sebastian's Bruder" → auf Lars: label='Bruder',
      related_person_name='Sebastian'.
  NIEMALS umgekehrt — also NICHT auf Juan label='Tochter' weil Luna
  seine Tochter ist. Das wäre falsch herum.

  Symmetrische Beziehungen (Ehepartner:in, Partner:in, Freund:in,
  Kolleg:in) werden serverseitig automatisch auf der anderen Person
  gespiegelt — du musst sie nur EINMAL setzen, egal in welche Richtung.
- create_note NUR als LETZTE Wahl — wenn KEIN strukturiertes Feld
  passt. Vorher prüfe IMMER:
    • „durch X" / „über X kennengelernt" → how_we_met + relationship
      mit label='Vermittelt durch' (KEINE Notiz!)
    • „kennengelernt vor N Jahren" → met_date (current_year - N)
    • „auf der Bauma" / „am TUM" / „in München" → met_location
    • „einer von X's Freunden" → relationship + ggf. purpose=personal
    • „Telefon ...", „Mail ...", „LinkedIn ..." → phones/emails/socials
    • „Geburtstag ...", „Hochzeitstag ..." → important_dates
    • Beziehung zu anderer Person → relationships
  ERST wenn nach diesem Filter NICHTS mehr übrig bleibt, das
  Restmaterial in notes oder create_note packen.

- create_reminder für Versprechen, Geburtstage, Check-ins
- create_todo für allgemeine Aufgaben

VERMITTLER-PATTERN (häufig in Voice):
  „Kennengelernt durch Nick Rendino vor 11 Jahren"
    →  update_person (oder create_person) mit:
       how_we_met = "Durch Nick Rendino"
       met_date = "{current_year - 11}-01-01"
       add_relationships = [{
         related_person_name: "Nick Rendino",
         label: "Vermittelt durch"
       }]
    + falls Nick Rendino NICHT in der People-Liste:
       VORHER create_person für Nick Rendino aufrufen, dann die
       Beziehung referenzieren. Wenn der Name unsicher ist
       (gleicher Vorname existiert), nutze suggest_replies und
       frage „Welcher Nick? [Nick Rendino] [Nick Anders] [Neue Person]".

Gib zusätzlich zur Tool-Nutzung eine kurze Bestätigung in 1 Satz aus,
was du extrahiert hast — knapp, kein "Ich habe verstanden, dass..."
Schmus. Beispiel: "Treffen mit Marvin geloggt, Pricing-Reminder bis Mittwoch."

- query_people wenn der Nutzer eine Such- oder Filterfrage stellt:
  „zeig alle in München", „wer ist im Inneren Kreis", „finde Padel-
  Spieler", „suche Müller". Setze nur die Felder die der Nutzer
  WIRKLICH gesagt hat. Du wirst danach auf die /people-Liste mit
  diesen Filtern navigiert. Antworte in 1 Satz mit der Aktion
  („Filtere auf München und Padel."), die Liste übernimmt die Anzeige.

Wenn nichts zu extrahieren ist (Smalltalk, Frage ohne Filter-Absicht),
antworte einfach direkt ohne Tool-Use, in höchstens 2 Sätzen.

WICHTIG — Output-Format:
- Reiner Text in deiner Antwort. Keine Markdown-Formatierung (kein **,
  kein *, keine Bullet-Listen, keine Backticks). Sarah Eve liest das
  wörtlich vor.
- Stelle EINE Frage gleichzeitig, nicht mehrere parallel.
- Wenn du Optionen vorschlagen willst (z.B. "beruflich, privat oder
  beides?"), nutze das Tool suggest_replies — der Nutzer kann sie dann
  antippen statt sprechen.`;
}
