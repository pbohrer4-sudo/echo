// Server-Component für die Life-Events-Galerie auf Person-Detail
// (Phase D2, Briefing v3 §11). Fetched die Events parallel, signed
// URLs für File-Thumbnails on-the-fly, übergibt an Client-Component
// für Add-Modal + Detail-Modal.

import { listLifeEventsForPerson, getSignedFileUrl } from "@/lib/life-events";
import { LifeEventsGallery } from "@/components/life-events-gallery";

export async function LifeEventsBlock({
  personId,
}: {
  personId: string;
}) {
  const events = await listLifeEventsForPerson(personId);

  // Signed URLs parallel holen. Wenn der File-Path null ist (z.B.
  // milestone/note), bleibt's null.
  const eventsWithUrls = await Promise.all(
    events.map(async (e) => ({
      ...e,
      fileUrl: await getSignedFileUrl(e.file_path),
      thumbnailUrl: await getSignedFileUrl(e.thumbnail_path),
    })),
  );

  return (
    <LifeEventsGallery
      personId={personId}
      events={eventsWithUrls}
    />
  );
}
