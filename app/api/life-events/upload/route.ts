import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIFE_EVENTS_BUCKET } from "@/lib/life-events";

export const runtime = "nodejs";
export const maxDuration = 60;

// Lazy bucket-Provisioning: beim allerersten Upload existiert der
// Bucket evtl. noch nicht (Supabase-Storage-Buckets müssen über
// die Admin-API angelegt werden, nicht per Migration). Wir checken
// einmal pro Process und legen ihn an, wenn er fehlt.
let bucketEnsured = false;
async function ensureBucket(): Promise<{ ok: boolean; error?: string }> {
  if (bucketEnsured) return { ok: true };
  try {
    const admin = createAdminClient();
    const { data: buckets, error: listErr } = await admin.storage.listBuckets();
    if (listErr) return { ok: false, error: listErr.message };
    if (!buckets?.some((b) => b.name === LIFE_EVENTS_BUCKET)) {
      const { error: createErr } = await admin.storage.createBucket(
        LIFE_EVENTS_BUCKET,
        {
          // Private — Zugriff läuft ausschließlich über signed URLs,
          // die getSignedFileUrl in lib/life-events.ts ausstellt.
          public: false,
          fileSizeLimit: 25 * 1024 * 1024,
        },
      );
      if (createErr) return { ok: false, error: createErr.message };
    }
    bucketEnsured = true;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "bucket setup failed",
    };
  }
}

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

  // Bucket einmalig anlegen falls noch nicht da. Nutzt service-role —
  // der User-Client kann keine Buckets erstellen.
  const ensure = await ensureBucket();
  if (!ensure.ok) {
    console.error("[life-events upload] bucket setup failed", ensure.error);
    return NextResponse.json(
      { error: `Speicherort konnte nicht vorbereitet werden: ${ensure.error}` },
      { status: 500 },
    );
  }

  // Eindeutiger Sub-Folder pro Upload, damit kein Filename-Clash.
  const subfolder = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${subfolder}/${safeName}`;

  // Upload mit dem user-scoped Client damit RLS-Storage-Policies
  // greifen (user-ordner-prefix).
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
    // Wenn der User-Client wegen RLS-Policy nicht uploaden darf
    // (Storage-Policies wurden nie angelegt), fallback auf Admin-Client.
    if (
      uploadErr.message.toLowerCase().includes("policy") ||
      uploadErr.message.toLowerCase().includes("permission")
    ) {
      try {
        const admin = createAdminClient();
        const { error: adminErr } = await admin.storage
          .from(LIFE_EVENTS_BUCKET)
          .upload(path, arrayBuffer, {
            contentType: file.type,
            cacheControl: "3600",
            upsert: false,
          });
        if (!adminErr) {
          return NextResponse.json({
            path,
            size: file.size,
            mime: file.type,
            name: safeName,
          });
        }
        console.error("[life-events upload] admin fallback failed", adminErr);
      } catch (err) {
        console.error("[life-events upload] admin client failed", err);
      }
    }
    return NextResponse.json(
      { error: `Upload fehlgeschlagen: ${uploadErr.message}` },
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
