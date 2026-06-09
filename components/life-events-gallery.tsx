"use client";

// Life Events Galerie auf Person-Detail (Phase D2, Briefing v3 §11).
//
// Grid mit Event-Cards (Foto/Doc/Voice/Notiz/Milestone). Klick auf
// Card → Detail-Modal mit Preview. Add-Button rechts → Add-Modal
// mit Upload + Metadaten.

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import {
  LIFE_EVENT_LABELS,
  type LifeEventRow,
  type LifeEventType,
  type LocationGeo,
} from "@/lib/types";
import {
  createLifeEventForPerson,
  deleteLifeEventAction,
  updateLifeEventForPerson,
} from "@/app/(app)/people/[id]/life-event-actions";
import { LocationAutocomplete } from "@/components/location-autocomplete";

export interface LifeEventWithUrls extends LifeEventRow {
  fileUrl: string | null;
  thumbnailUrl: string | null;
}

interface Props {
  personId: string;
  events: LifeEventWithUrls[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function eventGradient(type: LifeEventType): string {
  // Briefing-Screenshot Card-Look: pastellige Gradienten je nach Type.
  switch (type) {
    case "photo":
      return "linear-gradient(135deg, #FCE3E1 0%, #F4C8C5 100%)";
    case "document":
      return "linear-gradient(135deg, #DCEAFA 0%, #B7D2EF 100%)";
    case "voice_note":
      return "linear-gradient(135deg, #F4DDF0 0%, #E5BBE0 100%)";
    case "milestone":
      return "linear-gradient(135deg, #FAEEDA 0%, #ECD1A0 100%)";
    case "note":
      return "linear-gradient(135deg, #E1F5EE 0%, #B6E0CF 100%)";
  }
}

function eventGlyph(type: LifeEventType): string {
  switch (type) {
    case "photo":
      return "🖼";
    case "document":
      return "📄";
    case "voice_note":
      return "🎙";
    case "milestone":
      return "⭐";
    case "note":
      return "📝";
  }
}

export function LifeEventsGallery({ personId, events }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [openEvent, setOpenEvent] = useState<LifeEventWithUrls | null>(null);
  const [editingEvent, setEditingEvent] =
    useState<LifeEventWithUrls | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="t-label">
          Life Events {events.length > 0 && `(${events.length})`}
        </span>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex h-8 items-center gap-1 rounded border border-rule bg-paper px-3 text-xs text-ink-2 transition hover:border-action hover:text-action"
        >
          + Hinzufügen
        </button>
      </div>

      {events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-rule bg-paper-2 px-4 py-6 text-center text-xs italic text-ink-3">
          Foto, Dokument, Voice-Note, Meilenstein oder Notiz hinzufügen.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {events.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setOpenEvent(e)}
              className="group relative overflow-hidden rounded-2xl border border-rule bg-paper text-left transition hover:border-action"
            >
              {/* Thumbnail / Gradient-Fallback */}
              <div
                className="relative h-32 w-full"
                style={
                  e.thumbnailUrl || e.fileUrl
                    ? undefined
                    : { background: eventGradient(e.event_type) }
                }
              >
                {(e.thumbnailUrl ?? (e.event_type === "photo" ? e.fileUrl : null)) && (
                  <Image
                    src={e.thumbnailUrl ?? e.fileUrl!}
                    alt={e.title}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover"
                  />
                )}
                {!e.thumbnailUrl && e.event_type !== "photo" && (
                  <span className="absolute inset-0 flex items-center justify-center text-3xl">
                    {eventGlyph(e.event_type)}
                  </span>
                )}
                {/* Top-Right Type-Badge */}
                <span className="absolute right-2 top-2 rounded bg-black/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white backdrop-blur">
                  {LIFE_EVENT_LABELS[e.event_type]}
                </span>
                {/* Bottom-Left Location chip */}
                {e.location_name && (
                  <span className="absolute bottom-2 left-2 truncate rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white backdrop-blur max-w-[80%]">
                    {e.location_name}
                  </span>
                )}
              </div>
              {/* Meta */}
              <div className="space-y-0.5 px-3 py-2">
                <p className="truncate text-sm font-medium text-ink-1">
                  {e.title}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                  {formatDate(e.occurred_at)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showAdd && (
        <EventModal personId={personId} onClose={() => setShowAdd(false)} />
      )}

      {editingEvent && (
        <EventModal
          personId={personId}
          initialEvent={editingEvent}
          onClose={() => setEditingEvent(null)}
        />
      )}

      {openEvent && (
        <DetailModal
          event={openEvent}
          personId={personId}
          onEdit={() => {
            setEditingEvent(openEvent);
            setOpenEvent(null);
          }}
          onClose={() => setOpenEvent(null)}
        />
      )}
    </section>
  );
}

// ────── Event-Modal (Create + Edit) ──────

function EventModal({
  personId,
  initialEvent,
  onClose,
}: {
  personId: string;
  initialEvent?: LifeEventWithUrls;
  onClose: () => void;
}) {
  const isEdit = !!initialEvent;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [eventType, setEventType] = useState<LifeEventType>(
    initialEvent?.event_type ?? "note",
  );
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [description, setDescription] = useState(
    initialEvent?.description ?? "",
  );
  const [occurredAt, setOccurredAt] = useState(() => {
    const source = initialEvent?.occurred_at
      ? new Date(initialEvent.occurred_at)
      : new Date();
    return `${source.getFullYear()}-${String(source.getMonth() + 1).padStart(2, "0")}-${String(source.getDate()).padStart(2, "0")}`;
  });
  // Optional reminder tied to the event (only offered when creating).
  const [remind, setRemind] = useState(false);
  const [remindAt, setRemindAt] = useState("");
  const [locationName, setLocationName] = useState(
    initialEvent?.location_name ?? "",
  );
  const [locationGeo, setLocationGeo] = useState<LocationGeo | null>(
    initialEvent?.latitude != null && initialEvent?.longitude != null
      ? {
          lat: initialEvent.latitude,
          lng: initialEvent.longitude,
          place_id: initialEvent.google_place_id ?? "",
          display_name: initialEvent.location_name ?? "",
        }
      : null,
  );
  const [uploadedFile, setUploadedFile] = useState<{
    path: string;
    size: number;
    mime: string;
    name: string;
  } | null>(
    initialEvent?.file_path
      ? {
          path: initialEvent.file_path,
          size: initialEvent.file_size_bytes ?? 0,
          mime: initialEvent.mime_type ?? "",
          name: initialEvent.file_path.split("/").pop() ?? "Datei",
        }
      : null,
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsFile =
    eventType === "photo" ||
    eventType === "document" ||
    eventType === "voice_note";

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/life-events/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Upload fehlgeschlagen");
      }
      setUploadedFile(data);
      // Default-Titel aus Filename wenn noch leer
      if (!title) {
        setTitle(data.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsFile && !uploadedFile) {
      setError("Bitte erst eine Datei hochladen");
      return;
    }
    if (!title.trim()) {
      setError("Titel fehlt");
      return;
    }

    const fd = new FormData();
    fd.append("person_id", personId);
    fd.append("title", title);
    fd.append("description", description);
    fd.append("event_type", eventType);
    fd.append("occurred_at", occurredAt);
    fd.append("location_name", locationName);
    if (locationGeo) {
      fd.append("latitude", String(locationGeo.lat));
      fd.append("longitude", String(locationGeo.lng));
      fd.append("google_place_id", locationGeo.place_id);
    }
    if (uploadedFile) {
      fd.append("file_path", uploadedFile.path);
      fd.append("file_size_bytes", String(uploadedFile.size));
      fd.append("mime_type", uploadedFile.mime);
    }
    if (remind && remindAt) {
      fd.append("remind", "on");
      fd.append("remind_at", remindAt);
    }

    startTransition(async () => {
      const res =
        isEdit && initialEvent
          ? await updateLifeEventForPerson(initialEvent.id, personId, fd)
          : await createLifeEventForPerson(fd);
      if (!res.ok) {
        setError(res.error ?? "Fehler");
        return;
      }
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-rule bg-paper shadow-[0_8px_30px_rgba(20,17,13,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-rule-soft bg-paper-2 px-5 py-3">
          <div>
            <p className="t-label">
              {isEdit ? "Life Event bearbeiten" : "Life Event hinzufügen"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 transition hover:text-ink-1"
            aria-label="Schließen"
          >
            ×
          </button>
        </header>

        <form onSubmit={submit} className="space-y-4 px-5 py-4">
          {/* Event-Type-Picker */}
          <div className="space-y-1.5">
            <span className="t-label">Typ</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LIFE_EVENT_LABELS) as LifeEventType[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEventType(t)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
                      eventType === t
                        ? "border-action bg-action-soft text-ink-1"
                        : "border-rule bg-paper text-ink-3 hover:border-ink-3"
                    }`}
                  >
                    <span aria-hidden>{eventGlyph(t)}</span>
                    {LIFE_EVENT_LABELS[t]}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* File-Upload für photo/document/voice_note */}
          {needsFile && (
            <div className="space-y-1.5">
              <span className="t-label">Datei</span>
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  eventType === "photo"
                    ? "image/*"
                    : eventType === "voice_note"
                      ? "audio/*"
                      : undefined
                }
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="hidden"
              />
              {uploadedFile ? (
                <div className="flex items-center justify-between gap-3 rounded border border-rule-soft bg-paper-2 px-3 py-2">
                  <span className="truncate text-xs text-ink-1">
                    ✓ {uploadedFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-xs text-ink-3 hover:text-bad"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full rounded border border-dashed border-rule bg-paper-2 px-3 py-3 text-sm text-ink-3 transition hover:border-action hover:text-action disabled:opacity-50"
                >
                  {uploading ? "Lädt hoch…" : "Datei wählen (max 25 MB)"}
                </button>
              )}
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="t-label">Titel *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="t-label">Datum *</span>
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                required
                className="h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="t-label">Ort (optional)</span>
              <LocationAutocomplete
                name="location_name"
                defaultValue={locationName}
                placeholder="z.B. München, Bauma 2024"
                className="h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
                onChange={(value, geo) => {
                  setLocationName(value);
                  setLocationGeo(geo);
                }}
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="t-label">Beschreibung (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            />
          </label>

          {!initialEvent && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-ink-2">
                <input
                  type="checkbox"
                  checked={remind}
                  onChange={(e) => {
                    setRemind(e.target.checked);
                    // Default the reminder date to the event date.
                    if (e.target.checked && !remindAt) setRemindAt(occurredAt);
                  }}
                />
                An dieses Life Event erinnern (optional)
              </label>
              {remind && (
                <label className="block space-y-1.5">
                  <span className="t-label">Erinnerung am</span>
                  <input
                    type="date"
                    value={remindAt}
                    onChange={(e) => setRemindAt(e.target.value)}
                    className="h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
                  />
                </label>
              )}
            </div>
          )}

          {error && (
            <p className="rounded border border-bad/40 bg-bad/5 px-3 py-2 text-xs text-bad">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={pending || uploading}
              className="rounded border border-action bg-action px-4 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
            >
              {pending ? "Speichere…" : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ────── Detail-Modal ──────

function DetailModal({
  event,
  personId,
  onEdit,
  onClose,
}: {
  event: LifeEventWithUrls;
  personId: string;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteLifeEventAction(event.id, personId);
      if (res.ok) {
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-rule bg-paper shadow-[0_8px_30px_rgba(20,17,13,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-rule-soft bg-paper-2 px-5 py-3">
          <div className="flex items-center gap-2">
            <span aria-hidden>{eventGlyph(event.event_type)}</span>
            <span className="t-label">{LIFE_EVENT_LABELS[event.event_type]}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 transition hover:text-ink-1"
            aria-label="Schließen"
          >
            ×
          </button>
        </header>

        {/* Preview-Bereich */}
        {event.event_type === "photo" && event.fileUrl && (
          <div className="relative h-80 w-full bg-paper-2">
            <Image
              src={event.fileUrl}
              alt={event.title}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
        )}
        {event.event_type === "document" && event.fileUrl && (
          <div className="px-5 py-4">
            <a
              href={event.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded border border-rule bg-paper-2 px-3 py-2 text-sm text-ink-1 transition hover:border-action"
            >
              📄 {event.title}
              {event.file_size_bytes && (
                <span className="font-mono text-[10px] text-ink-3">
                  · {(event.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </a>
          </div>
        )}
        {event.event_type === "voice_note" && event.fileUrl && (
          <div className="px-5 py-4">
            <audio controls src={event.fileUrl} className="w-full" />
          </div>
        )}

        {/* Metadaten */}
        <dl className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-1.5 px-5 py-4 text-sm">
          <dt className="t-label">Titel</dt>
          <dd className="text-ink-1">{event.title}</dd>
          <dt className="t-label">Datum</dt>
          <dd className="text-ink-1">{formatDate(event.occurred_at)}</dd>
          {event.location_name && (
            <>
              <dt className="t-label">Ort</dt>
              <dd className="text-ink-1">{event.location_name}</dd>
            </>
          )}
          {event.description && (
            <>
              <dt className="t-label">Notiz</dt>
              <dd className="whitespace-pre-wrap text-ink-1">
                {event.description}
              </dd>
            </>
          )}
        </dl>

        <footer className="flex items-center justify-end gap-2 border-t border-rule-soft bg-paper-2 px-5 py-3">
          {confirming ? (
            <>
              <span className="text-xs text-ink-3">Wirklich löschen?</span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="rounded border border-bad bg-bad px-3 py-1.5 text-xs font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Lösche…" : "Ja, löschen"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded border border-rule px-3 py-1.5 text-xs text-ink-3 transition hover:border-bad hover:text-bad"
              >
                Löschen
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
              >
                Bearbeiten
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
