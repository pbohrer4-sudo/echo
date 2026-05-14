import Stripe from "stripe";

// Server-side Stripe client. STRIPE_SECRET_KEY ist erforderlich.
// Webhook-Verifizierung nutzt STRIPE_WEBHOOK_SECRET in
// app/api/webhooks/stripe/route.ts.
//
// Setup:
//   1. Stripe Dashboard → Developers → API Keys → Secret key kopieren
//   2. Stripe Dashboard → Developers → Webhooks → endpoint
//      https://<host>/api/webhooks/stripe anlegen, Events abonnieren:
//      customer.subscription.created, .updated, .deleted, customer.created
//   3. Signing secret kopieren → .env.local + Vercel:
//        STRIPE_SECRET_KEY=sk_...
//        STRIPE_WEBHOOK_SECRET=whsec_...
//        STRIPE_PRICE_STARTER=price_...     (3.99€)
//        STRIPE_PRICE_PRO=price_...         (9.99€)
//        STRIPE_PRICE_TEAM=price_...        (49.99€)

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY fehlt — in .env.local + Vercel-Env setzen.",
      );
    }
    // apiVersion wird über das im Stripe-Dashboard gepinnte Account-
    // Default genommen — kein Hard-Coding hier damit Updates nicht
    // gegen Versions-Mismatch laufen.
    client = new Stripe(key);
  }
  return client;
}

// Mappt eine Stripe Price-ID auf einen internen Tier-Namen. Damit
// haben wir im UI / in Stats stabile Tier-Bezeichnungen unabhängig
// davon wie die Stripe-Preise später umgebaut werden.
export function tierFromPriceId(
  priceId: string | null | undefined,
): "starter" | "pro" | "team" | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_TEAM) return "team";
  return null;
}
