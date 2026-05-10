import Link from "next/link";

// Tab navigation rendered only for the self-person profile. All four
// tabs map to a `?tab=…` query param — including Settings, which now
// renders inline as a screen-within-screen rather than navigating
// out to /settings.

export type SelfTab = "profile" | "streaks" | "payments" | "settings";

interface TabDef {
  id: SelfTab;
  label: string;
  href: string;
}

export function SelfProfileTabs({
  personId,
  activeTab,
}: {
  personId: string;
  activeTab: SelfTab;
}) {
  const tabs: TabDef[] = [
    { id: "profile", label: "Profil", href: `/people/${personId}` },
    {
      id: "streaks",
      label: "Streaks",
      href: `/people/${personId}?tab=streaks`,
    },
    {
      id: "payments",
      label: "Payments",
      href: `/people/${personId}?tab=payments`,
    },
    {
      id: "settings",
      label: "Settings",
      href: `/people/${personId}?tab=settings`,
    },
  ];

  return (
    <nav
      role="tablist"
      aria-label="Mein Profil"
      className="flex flex-wrap gap-1 border-b border-rule"
    >
      {tabs.map((t) => {
        const isActive = activeTab === t.id;
        const className = `relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
          isActive
            ? "border-action font-medium text-ink-1"
            : "border-transparent text-ink-3 hover:border-ink-3 hover:text-ink-1"
        }`;
        return (
          <Link key={t.id} href={t.href} className={className} role="tab">
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

// Validate + narrow the `?tab=` query param so callers don't have
// to repeat the string list.
export function parseSelfTab(raw: string | undefined): SelfTab {
  if (raw === "streaks" || raw === "payments" || raw === "settings") {
    return raw;
  }
  return "profile";
}
