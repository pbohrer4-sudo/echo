"use client";

// Client-Wrapper für das Lazy-Loading des PersonGraphCanvas. Cytoscape
// (~500 KB) braucht `window` und darf nicht serverseitig gerendert
// werden — `ssr: false` ist aber in Server Components (graph/page.tsx)
// verboten. Der dynamische Import lebt deshalb hier in der Client-
// Boundary; das Cytoscape-Bundle lädt erst auf der Graph-Route.

import dynamic from "next/dynamic";

export const PersonGraphCanvas = dynamic(
  () => import("./person-graph").then((m) => m.PersonGraphCanvas),
  { ssr: false },
);
