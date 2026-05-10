import { NextResponse } from "next/server";
import { syncGmail } from "@/lib/email-sync";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const result = await syncGmail();
  if (result.ok) {
    revalidatePath("/people");
    revalidatePath("/inbox");
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
