import { NextResponse } from "next/server";
import { listPeopleDuplicates, mergePeople } from "@/lib/duplicates";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const pairs = await listPeopleDuplicates();
  return NextResponse.json({ pairs });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { primary_id, secondary_id } = body as {
    primary_id?: string;
    secondary_id?: string;
  };
  if (!primary_id || !secondary_id) {
    return NextResponse.json(
      { error: "primary_id + secondary_id required" },
      { status: 400 },
    );
  }
  const result = await mergePeople(primary_id, secondary_id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "merge failed" },
      { status: 400 },
    );
  }
  revalidatePath("/people");
  revalidatePath("/people/duplicates");
  revalidatePath(`/people/${primary_id}`);
  return NextResponse.json({ ok: true });
}
