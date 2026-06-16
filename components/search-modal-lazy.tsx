"use client";

// Client-Wrapper für das Lazy-Loading der SearchModal. `next/dynamic`
// mit `ssr: false` ist in Server Components (z.B. app/(app)/layout.tsx)
// nicht erlaubt — deshalb kapseln wir den dynamischen Import hier in
// einer Client-Boundary. Effekt: das ~Modal-Bundle wird erst geladen
// wenn die Suche zum ersten Mal geöffnet wird, nicht im initialen SSR.

import dynamic from "next/dynamic";

export const SearchModal = dynamic(
  () => import("@/components/search-modal").then((m) => ({ default: m.SearchModal })),
  { ssr: false },
);
