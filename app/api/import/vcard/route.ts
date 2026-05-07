import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseVcards, type VCardContact } from "@/lib/vcard";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 20 * 1024 * 1024; // ~20 MB covers a few thousand iPhone contacts

interface PreviewRow extends VCardContact {
  // Stable client-side key (lined up with index in the file).
  key: string;
  // True when an existing person has the same case-insensitive name.
  // The UI auto-uncorrects the checkbox for these so the user doesn't
  // accidentally re-import everyone.
  duplicate: boolean;
  duplicate_of_id: string | null;
}

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
      { error: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Datei zu groß (max. 20 MB)" },
      { status: 400 },
    );
  }

  const text = await file.text();
  const parsed = parseVcards(text);

  // Build a name-index of existing people for cheap dedup. This trades
  // a tiny memory hit for not running 1 query per imported row.
  const { data: existing, error } = await supabase
    .from("people")
    .select("id, name")
    .is("deleted_at", null)
    .eq("is_self", false);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byName = new Map<string, string>();
  for (const row of (existing ?? []) as { id: string; name: string }[]) {
    byName.set(row.name.trim().toLowerCase(), row.id);
  }

  const rows: PreviewRow[] = parsed.map((c, i) => {
    const dupId = byName.get(c.name.trim().toLowerCase()) ?? null;
    return {
      ...c,
      key: `vcf-${i}`,
      duplicate: dupId !== null,
      duplicate_of_id: dupId,
    };
  });

  return NextResponse.json({
    rows,
    summary: {
      parsed: rows.length,
      duplicates: rows.filter((r) => r.duplicate).length,
      file_name: file.name,
      file_size: file.size,
    },
  });
}
