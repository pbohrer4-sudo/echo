import { VoiceOrb } from "@/components/voice-orb";

// Voice ist die einzige Page wo der innere Composer am Bildschirmrand
// kleben muss — wir füllen die Höhe von <main> komplett, der VoiceOrb
// macht intern Header + Scroll-Bereich + sticky-bottom Composer via
// flex column.
export default function HomePage() {
  return (
    <div className="h-full">
      <VoiceOrb />
    </div>
  );
}
