"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded border border-rule px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
    >
      Logout
    </button>
  );
}
