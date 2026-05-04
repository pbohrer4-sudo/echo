import { redirect } from "next/navigation";
import { getOrCreateSelfPerson } from "@/lib/people";

export default async function ProfilePage() {
  const self = await getOrCreateSelfPerson();
  redirect(`/people/${self.id}`);
}
