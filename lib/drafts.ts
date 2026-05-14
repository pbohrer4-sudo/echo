// WhatsApp-Draft-Generierung (Phase D1, Briefing v3 Section 18).
//
// Sechs Use-Cases mit jeweils eigener Tonalität + Prompt. Generierung
// läuft über Claude (lib/ai chatForTask), Style-Regeln werden im
// System-Prompt enforced.

import type { Person } from "@/lib/types";
import { chat } from "@/lib/claude";
import { getUserContext } from "@/lib/user-context";
import { listInteractionsForPerson } from "@/lib/inbox";
import { listTagsForPerson } from "@/lib/tags";
import { listPassionsForPerson } from "@/lib/passions";
import {
  DRAFT_USE_CASE_DESCRIPTIONS,
  DRAFT_USE_CASE_LABELS,
  type DraftUseCase,
} from "@/lib/drafts-types";

export type { DraftUseCase } from "@/lib/drafts-types";
export {
  DRAFT_USE_CASE_LABELS,
  DRAFT_USE_CASE_DESCRIPTIONS,
} from "@/lib/drafts-types";

// System-Prompt mit allen Stil-Regeln. Wird zu jedem Use-Case
// dazugehängt damit der Stil konsistent bleibt.
const STYLE_SYSTEM_PROMPT = `Du schreibst als Patrick Bohrer einen WhatsApp-Entwurf.

Stil-Regeln (verbindlich):
- Keine Em-Dashes (—). Immer normale Bindestriche (-).
- Deutsche Umlaute korrekt: ä ö ü Ä Ö Ü ß.
- Direkt und persönlich, nicht steif.
- Kurze Sätze. Maximal 4-5 Sätze gesamt.
- Du-Form wenn Beziehung etabliert.
- Klingt nach Mensch, nicht nach KI.
- KEINE Begrüßung mit "Hallo {Name}" — geh direkt los, das ist WhatsApp.

Verboten (kommt automatisch zu KI-mäßig rüber):
- "Es würde mich freuen wenn..."
- "Ich hoffe es geht dir gut"
- "Falls du Zeit hast..."
- "Liebe Grüße"
- "Sehr geehrte/r"
- "Mit freundlichen Grüßen"
- Emojis am Satzanfang/-ende

Output: NUR der Nachrichtentext. Keine Anführungszeichen, keine
Anmerkungen, kein "Hier ist der Entwurf:". Nur die Nachricht selbst.`;

interface DraftContext {
  person: Person;
  tagNames: string[];
  passionNames: string[];
  lastInteractionSummary: string | null;
  daysSinceLastInteraction: number | null;
}

async function gatherContext(personId: string): Promise<DraftContext | null> {
  const ctx = await getUserContext();
  if (!ctx) return null;

  const [interactions, tags, passions] = await Promise.all([
    listInteractionsForPerson(personId),
    listTagsForPerson(personId),
    listPassionsForPerson(personId),
  ]);

  // Person wird in der API-Route von außen reingegeben — wir laden
  // sie nicht doppelt.
  return {
    person: {} as Person, // wird vom Caller ersetzt
    tagNames: tags.map((t) => t.name),
    passionNames: passions.map((p) => p.name),
    lastInteractionSummary: interactions[0]?.summary ?? null,
    daysSinceLastInteraction: interactions[0]?.occurred_at
      ? Math.floor(
          (Date.now() - new Date(interactions[0].occurred_at).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null,
  };
}

function buildContextBlock(ctx: DraftContext): string {
  const lines: string[] = [];
  const p = ctx.person;
  lines.push(`Person: ${p.name}`);
  if (p.company) lines.push(`Firma: ${p.company}`);
  if (p.role) lines.push(`Rolle: ${p.role}`);
  if (p.how_we_met) lines.push(`Wie wir uns kennengelernt haben: ${p.how_we_met}`);
  if (p.purpose) lines.push(`Zweck der Beziehung: ${p.purpose}`);
  if (p.depth) lines.push(`Tiefe: ${p.depth}`);
  if (ctx.passionNames.length > 0) {
    lines.push(`Passions: ${ctx.passionNames.join(", ")}`);
  }
  if (ctx.tagNames.length > 0) {
    lines.push(`Tags: ${ctx.tagNames.join(", ")}`);
  }
  if (ctx.lastInteractionSummary) {
    const ago =
      ctx.daysSinceLastInteraction !== null
        ? ` (vor ${ctx.daysSinceLastInteraction} Tagen)`
        : "";
    lines.push(`Letzte Interaktion${ago}: ${ctx.lastInteractionSummary}`);
  }
  return lines.join("\n");
}

function buildUseCasePrompt(useCase: DraftUseCase, ctx: DraftContext): string {
  const contextBlock = buildContextBlock(ctx);
  const firstName = ctx.person.name.split(/\s+/)[0];

  const intentByCase: Record<DraftUseCase, string> = {
    reengage: `Schreib eine warmherzige WhatsApp an ${firstName}. Es war länger nichts. Du willst dich melden ohne konkretes Anliegen, einfach weil dir die Person wichtig ist. Verweise wenn passend auf ein gemeinsames Erlebnis oder ein Interesse aus dem Kontext.`,
    business: `Schreib eine direkte aber respektvolle WhatsApp an ${firstName} für einen Business-Termin. Schlag konkret 2-3 Zeitfenster oder ein Format vor (Kaffee, Mittag, Call). Beziehe dich wenn möglich auf den Kontext der letzten Interaktion.`,
    birthday: `Schreib eine persönliche Geburtstags-WhatsApp an ${firstName}. Kein generisches "alles Gute". Beziehe einen konkreten Aspekt aus dem Kontext ein (gemeinsames Erlebnis, Interesse, letztes Gespräch). Halt es warm aber knapp.`,
    intro_thanks: `Schreib ${firstName} ein kurzes WhatsApp-Dankeschön für ein Intro. 2-3 Sätze: Dank + was du davon erwartest + Rück-Verpflichtung anbieten.`,
    follow_up: `Schreib ${firstName} ein action-orientiertes Follow-Up nach eurem letzten Kontakt. Beziehe dich konkret auf den Inhalt der letzten Interaktion. Schlag den nächsten Schritt vor (Treffen, konkrete Aktion, etc.).`,
    lebenszeichen: `Schreib ${firstName} ein behutsames Lebenszeichen. Du willst zeigen dass du noch da bist, ohne aktiv etwas zu wollen. Verweis auf ein Detail aus dem Kontext (Interest, Passion, gemeinsame Erfahrung) das du grad mitbekommen oder dran gedacht hast.`,
  };

  return `${intentByCase[useCase]}

Kontext zur Person:
${contextBlock}`;
}

export interface DraftResult {
  text: string;
  reasoning: string;
  useCase: DraftUseCase;
}

/**
 * Generiert einen WhatsApp-Entwurf für die gegebene Person + Use-Case.
 * Returns null wenn die Generierung fehlschlägt (z.B. kein API-Key).
 */
export async function generateDraft(
  person: Person,
  useCase: DraftUseCase,
): Promise<DraftResult | null> {
  const ctx = await getUserContext();
  if (!ctx) return null;

  const draftContext = await gatherContext(person.id);
  if (!draftContext) return null;
  draftContext.person = person;

  const userPrompt = buildUseCasePrompt(useCase, draftContext);

  try {
    const result = await chat({
      apiKey: ctx.byo_keys?.anthropic ?? ctx.claude_key,
      system: STYLE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 400,
    });

    // Generiere zusätzlich eine kurze "Reasoning"-Begründung — was die
    // AI dabei berücksichtigt hat. Das ist die "Was Echo dabei
    // berücksichtigt hat"-Box aus dem Briefing-Screenshot.
    const reasoningResult = await chat({
      apiKey: ctx.byo_keys?.anthropic ?? ctx.claude_key,
      system: `Du erklärst in 2-3 deutschen Sätzen welche Aspekte du im WhatsApp-Entwurf konkret berücksichtigt hast. Bezieh dich auf den Person-Kontext. Keine Floskeln. Direkt.`,
      messages: [
        {
          role: "user",
          content: `Person-Kontext:
${buildContextBlock(draftContext)}

Use-Case: ${DRAFT_USE_CASE_LABELS[useCase]} — ${DRAFT_USE_CASE_DESCRIPTIONS[useCase]}

Entwurf:
${result.text}

Warum dieser Stil/Inhalt? 2-3 Sätze.`,
        },
      ],
      maxTokens: 200,
    });

    return {
      text: result.text.trim(),
      reasoning: reasoningResult.text.trim(),
      useCase,
    };
  } catch (err) {
    console.error("[drafts] generation failed", err);
    return null;
  }
}
