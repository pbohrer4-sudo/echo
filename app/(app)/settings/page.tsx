import { redirect } from "next/navigation";
import { getOrCreateSelfPerson } from "@/lib/people";

// Settings now lives inline as a tab on the self profile. This route
// stays around so old bookmarks + the updateSettings action's
// default redirect target keep working — they bounce here, we
// resolve the self-person id, and forward to the tab.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const self = await getOrCreateSelfPerson();

  const params = new URLSearchParams({ tab: "settings" });
  if (saved) params.set("saved", saved);
  if (error) params.set("error", error);

  redirect(`/people/${self.id}?${params.toString()}`);
}
