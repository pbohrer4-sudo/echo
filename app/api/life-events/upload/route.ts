import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIFE_EVENTS_BUCKET } from "@/lib/life-events";

export const runtime = "nodejs";
export const maxDuration = 60;

// Upload-Endpoint für Life-Event-Files. Erwartet multipart/form-data
// mit Feld 'file'. Generiert einen UUID-Pfad unter dem aktuellen
// User-Namespace + Sub-Folder, damit später die life_event-Row darauf
// referenzieren kann.
//
// Workflow:
//   1. Client picked Datei
//   2. POST hierhin → bekommt zurück {path, size, mime}
//   3. Client schickt diese Werte mit dem create-Form an die
//      Server-Action createLifeEventForPerson
//
// Max-Größe: 25MB per Briefing-Spec.

const MAX_SIZE_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid multipart" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file fehlt" }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Max 25 MB — Datei ist ${(file.size / 1024 / 1024).toFixed(1)} MB` },
      { status: 413 },
    );
  }

  // Eindeutiger Sub-Folder pro Upload, damit kein Filename-Clash.
  const subfolder = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${subfolder}/${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from(LIFE_EVENTS_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) {
    console.error("[life-events upload] storage error", uploadErr);
    return NextResponse.json(
      {
        error: `Upload fehlgeschlagen: ${uploadErr.message}. Storage-Bucket "${LIFE_EVENTS_BUCKET}" angelegt?`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    path,
    size: file.size,
    mime: file.type,
    name: safeName,
  });
}
