// Default stakeholder taxonomy. Both E1 and E2 are extensible — the
// person form lets the user add custom values which are then stored
// alongside the defaults. Custom values surface as suggestions in
// future dropdowns automatically (gathered via lib/people.listAll*).

export const STAKEHOLDER_TYPES_E1 = [
  "Partner",
  "Investor",
  "Kunde",
  "Mitarbeiter",
  "Service-Provider",
  "Mentor",
  "Multiplikator",
  "Media",
  "Regulator",
  "Privat",
] as const;

export type StakeholderType = (typeof STAKEHOLDER_TYPES_E1)[number] | string;

// Per-E1 sub-type defaults. The form combines these with anything the
// user has added before; custom entries are simple strings.
export const STAKEHOLDER_SUB_TYPES_E2: Record<string, readonly string[]> = {
  Partner: ["Lieferant", "Channel", "JV", "Reseller"],
  Investor: ["VC", "Angel", "Family Office", "CVC", "LP"],
  Kunde: ["Enterprise", "SMB", "Individual", "Pilot"],
  Mitarbeiter: ["Festangestellt", "Freelancer", "Praktikum", "Berater"],
  "Service-Provider": ["Steuer", "Recht", "Marketing", "IT", "HR"],
  Mentor: ["Industry", "Personal", "Technical"],
  Multiplikator: [
    "Influencer",
    "Branchenexperte",
    "Speaker",
    "Community-Lead",
  ],
  Media: ["Press", "Podcast", "Newsletter", "TV"],
  Regulator: ["Government", "Audit", "Compliance"],
  Privat: ["Familie", "Freund", "Bekannter"],
};
