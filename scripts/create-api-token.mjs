// Mints a personal API token for the Siri / Apple Shortcuts integration
// (and any other headless caller). Run with:
//
//   node --env-file=.env.local scripts/create-api-token.mjs <user-email> [token-name]
//
// Prints the RAW token exactly once — copy it into your Apple Shortcut's
// Authorization header now, because only its SHA-256 hash is stored and it
// can never be shown again. Uses the service-role key (bypasses RLS).
//
// To revoke later: set revoked_at on the row, e.g. via the Supabase SQL
// editor:  update api_tokens set revoked_at = now() where id = '…';

import { createHash, randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const email = process.argv[2];
const name = process.argv[3] ?? "Siri Shortcut";
if (!email) {
  console.error(
    "Usage: node --env-file=.env.local scripts/create-api-token.mjs <user-email> [token-name]",
  );
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

// 1. Resolve the user_id from the email via the Auth admin API.
const usersRes = await fetch(
  `${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
  { headers },
);
if (!usersRes.ok) {
  console.error(`Auth admin lookup failed: ${usersRes.status} ${await usersRes.text()}`);
  process.exit(1);
}
const usersJson = await usersRes.json();
const users = Array.isArray(usersJson) ? usersJson : usersJson.users ?? [];
const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`No user found for email ${email}`);
  process.exit(1);
}

// 2. Mint the token (must match lib/api-token.ts: echo_ + 24 random bytes).
const raw = "echo_" + randomBytes(24).toString("hex");
const tokenHash = createHash("sha256").update(raw).digest("hex");
const tokenPrefix = raw.slice(0, 8);

// 3. Insert the row.
const insertRes = await fetch(`${url}/rest/v1/api_tokens`, {
  method: "POST",
  headers: { ...headers, Prefer: "return=representation" },
  body: JSON.stringify({
    user_id: user.id,
    name,
    token_hash: tokenHash,
    token_prefix: tokenPrefix,
    scopes: ["capture"],
  }),
});
if (!insertRes.ok) {
  console.error(`Insert failed: ${insertRes.status} ${await insertRes.text()}`);
  process.exit(1);
}

console.log("");
console.log("API token created for", email);
console.log("  name:  ", name);
console.log("  prefix:", tokenPrefix + "…");
console.log("");
console.log("  RAW TOKEN (shown once — copy it now):");
console.log("");
console.log("    " + raw);
console.log("");
console.log("Use it as the Authorization header in your Apple Shortcut:");
console.log("    Authorization: Bearer " + raw);
console.log("");
