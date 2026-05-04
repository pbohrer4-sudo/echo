import { VoiceOrb } from "@/components/voice-orb";
import { getDebriefStreak } from "@/lib/debriefs";

export default async function HomePage() {
  const streak = await getDebriefStreak();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      {streak.current > 0 && (
        <div className="mb-12 flex items-center gap-3 rounded border border-rule bg-paper-2 px-4 py-2">
          <span className="text-lg leading-none">🔥</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-ink-1">
              {streak.current} {streak.current === 1 ? "Tag" : "Tage"} Streak
            </span>
            {!streak.doneToday && (
              <span className="t-label">Heute noch offen</span>
            )}
            {streak.longest > streak.current && (
              <span className="t-label">Bestmarke {streak.longest}</span>
            )}
          </div>
        </div>
      )}
      <VoiceOrb />
    </div>
  );
}
