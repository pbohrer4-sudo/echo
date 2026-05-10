import { NextResponse } from "next/server";
import { markWhatsappRead } from "@/lib/whatsapp-inbox";
import { getUserContext } from "@/lib/user-context";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  await markWhatsappRead(id);
  revalidatePath("/inbox");
  return NextResponse.json({ ok: true });
}
