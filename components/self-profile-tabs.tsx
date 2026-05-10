import Link from "next/link";

// Tab navigation rendered only for the self-person profile. Each tab
// maps to a `?tab=…` query param except Settings, which is a top-
// level page (its own deep config screen). The Settings tab still
// renders inline so visually it lives "under the name" like the
// others — clicking just navigates out.

export type SelfTab = "profile" | "streaks" | "payments";

interface TabDef {
  id: SelfTab | "settings";
  label: string;
  href: string;
  external?: boolean;
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
      href: "/settings",
      external: true,
    },
  ];

  return (
    <nav
      role="tablist"
      aria-label="Mein Profil"
      className="flex flex-wrap gap-1 border-b border-rule"
    >
      {tabs.map((t) => {
        const isActive = !t.external && activeTab === t.id;
        const className = `relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
          isActive
            ? "border-action font-medium text-ink-1"
            : "border-transparent text-ink-3 hover:border-ink-3 hover:text-ink-1"
        }`;
        return (
          <Link key={t.id} href={t.href} className={className} role="tab">
            {t.label}
            {t.external && (
              <span aria-hidden className="text-[10px] text-ink-4">
                ↗
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

// Validate + narrow the `?tab=` query param so callers don't have
// to repeat the string list.
export function parseSelfTab(raw: string | undefined): SelfTab {
  if (raw === "streaks" || raw === "payments") return raw;
  return "profile";
}
