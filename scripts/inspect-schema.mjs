// Reads the live Supabase schema via PostgREST's OpenAPI endpoint and prints
// tables + columns. Run with:
//   node --env-file=.env.local scripts/inspect-schema.mjs
//
// Uses the service-role key (server-only, bypasses RLS) — never ship this
// script to the client bundle.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/`, {
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/openapi+json",
  },
});

if (!res.ok) {
  console.error(`PostgREST returned ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const spec = await res.json();

const tables = Object.entries(spec.definitions ?? {}).map(([name, def]) => ({
  name,
  columns: Object.entries(def.properties ?? {}).map(([col, meta]) => ({
    name: col,
    type: meta.format ?? meta.type ?? "?",
    required: (def.required ?? []).includes(col),
  })),
}));

if (tables.length === 0) {
  console.log("(no tables found in public schema)");
  process.exit(0);
}

console.log(`Tables in public schema: ${tables.length}`);
console.log("=".repeat(60));
for (const t of tables) {
  console.log(`\n${t.name}  (${t.columns.length} cols)`);
  for (const c of t.columns) {
    console.log(`  ${c.required ? "*" : " "} ${c.name.padEnd(28)} ${c.type}`);
  }
}
