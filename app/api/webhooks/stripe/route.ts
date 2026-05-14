import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, tierFromPriceId } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Stripe Webhook-Handler.
//
// Sicherheit: ausschließlich Signatur-Verifizierung gegen
// STRIPE_WEBHOOK_SECRET. Keine User-Session, kein Cookie — der
// Endpoint MUSS public sein damit Stripe ihn aufrufen kann.
//
// Body wird als raw text gelesen (nicht JSON-parsed!) damit die HMAC
// stimmt. Request-text() ist das App-Router-Pendant zu Express' raw
// body parser.
//
// Idempotenz: alle Writes nutzen upsert auf stripe_subscription_id
// (unique) oder eine eindeutige Email-Match — Stripe sendet Events
// nach Retry-Failure mehrfach, das darf nicht doppelt zählen.

export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json(
      { error: "webhook misconfigured" },
      { status: 400 },
    );
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      {
        error: `signature verification: ${err instanceof Error ? err.message : "fail"}`,
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(admin, sub);
        break;
      }
      case "customer.created":
      case "customer.updated": {
        const cust = event.data.object as Stripe.Customer;
        await linkCustomerToProfile(admin, cust);
        break;
      }
      default:
        // andere Events ignorieren — Handler bleibt narrow scoped
        break;
    }
  } catch (err) {
    console.error("[stripe webhook] handler failed", event.type, err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Linkt einen Stripe-Customer per Email-Match an ein Profile. Wir
// nutzen die admin-API listUsers (paginated) und filtern client-side
// — bei < 1000 Usern problemlos. Wenn größer, müssten wir auth.users
// via SECURITY DEFINER function abfragen.
async function linkCustomerToProfile(
  admin: ReturnType<typeof createAdminClient>,
  cust: Stripe.Customer,
): Promise<void> {
  if (!cust.email) return;
  const email = cust.email.toLowerCase();

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error("[stripe webhook] listUsers failed", error);
    return;
  }
  const match = data.users.find(
    (u) => u.email?.toLowerCase() === email,
  );
  if (!match) {
    console.warn(`[stripe webhook] customer ${cust.id} email ${email} has no echo account yet`);
    return;
  }
  const { error: updError } = await admin
    .from("profiles")
    .update({ stripe_customer_id: cust.id })
    .eq("id", match.id);
  if (updError) {
    console.error("[stripe webhook] profile update failed", updError);
  }
}

async function upsertSubscription(
  admin: ReturnType<typeof createAdminClient>,
  sub: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Find user via profiles.stripe_customer_id (gesetzt durch
  // linkCustomerToProfile auf customer.created/updated)
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!profile) {
    // Falls customer-Event noch nicht angekommen war: hole Customer
    // jetzt direkt und versuche das Mapping. Sonst skip — bei
    // erneutem Retry kommt's normalerweise durch.
    const stripe = getStripe();
    const cust = await stripe.customers.retrieve(customerId);
    if (cust.deleted) return;
    await linkCustomerToProfile(admin, cust as Stripe.Customer);
    const { data: retry } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (!retry) {
      console.warn(
        `[stripe webhook] subscription ${sub.id} → kein Profile für customer ${customerId}`,
      );
      return;
    }
    return upsertSubscriptionForUser(admin, retry.id, customerId, sub);
  }

  await upsertSubscriptionForUser(admin, profile.id, customerId, sub);
}

async function upsertSubscriptionForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  customerId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const item = sub.items.data[0];
  const priceId = item?.price.id ?? null;
  const unitAmount = item?.price.unit_amount ?? 0;
  const interval = item?.price.recurring?.interval ?? "month";
  // Jahres-Pläne als monatlichen Anteil tracken damit MRR-Summe stimmt
  const amountCents =
    interval === "year" ? Math.round(unitAmount / 12) : unitAmount;

  // current_period_* können auf Subscription oder auf Item liegen
  // (Stripe-API-Versionen variieren). Defensiv beide Quellen prüfen.
  type WithPeriods = {
    current_period_start?: number;
    current_period_end?: number;
  };
  const subWithPeriods = sub as Stripe.Subscription & WithPeriods;
  const itemWithPeriods = item as (typeof item & WithPeriods) | undefined;
  const start =
    subWithPeriods.current_period_start ??
    itemWithPeriods?.current_period_start ??
    null;
  const end =
    subWithPeriods.current_period_end ??
    itemWithPeriods?.current_period_end ??
    null;

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      tier: tierFromPriceId(priceId),
      status: sub.status,
      current_period_start: start ? new Date(start * 1000).toISOString() : null,
      current_period_end: end ? new Date(end * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at: sub.canceled_at
        ? new Date(sub.canceled_at * 1000).toISOString()
        : null,
      amount_cents: amountCents,
      currency: item?.price.currency ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) {
    console.error("[stripe webhook] subscription upsert failed", error);
    throw error;
  }
}
