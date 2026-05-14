"use server";

// Legacy createPerson/updatePerson wurden in 0025 entfernt — die alte
// person-form.tsx mit allen Stakeholder/Priority/CTA/Industry/Geo-
// Feldern existiert nicht mehr. Quick-Add läuft über
// app/(app)/people/new/quick-add-actions.ts.
//
// deletePerson bleibt — schlanker Soft-Delete via deleted_at.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function deletePerson(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    redirect(`/people/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/people");
  redirect("/people");
}
