import { VoiceOrb } from "@/components/voice-orb";
import { getDebriefStreak } from "@/lib/debriefs";

export default async function HomePage() {
  const streak = await getDebriefStreak();

  return (
    <div className="flex h-screen flex-col">
      {streak.current > 0 && (
        <div className="flex items-center gap-3 border-b border-rule bg-paper-2 px-6 py-2 text-sm">
          <span className="text-base leading-none">🔥</span>
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
      )}
      <div className="min-h-0 flex-1">
        <VoiceOrb />
      </div>
    </div>
  );
}
