import { NextResponse } from "next/server";
import { syncGoogleCalendar } from "@/lib/calendar-sync";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const result = await syncGoogleCalendar();
  if (result.ok) {
    revalidatePath("/people");
    revalidatePath("/inbox");
    revalidatePath("/rhythmus");
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
