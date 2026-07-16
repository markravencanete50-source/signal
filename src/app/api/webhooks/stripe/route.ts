import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { applySubscriptionState } from "@/lib/billing";
import { stripe, isStripeConfigured } from "@/lib/stripe";

/**
 * POST /api/webhooks/stripe — Stripe subscription lifecycle.
 *
 * Public and session-less; authenticated ONLY by the Stripe signature (verified
 * against STRIPE_WEBHOOK_SECRET over the raw body). An unsigned or tampered
 * request is rejected before any state changes — this is the security boundary
 * for the endpoint that flips a workspace's plan.
 *
 * All handled events resolve to "apply the subscription's current state to its
 * workspace", which is idempotent, so a replayed or out-of-order delivery is safe.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isStripeConfigured() || !secret) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // The raw body is required for signature verification — never parse it first.
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature.";
    return NextResponse.json({ error: `Webhook signature failed: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscriptionState(event.data.object as Stripe.Subscription);
        break;
      }
      case "checkout.session.completed": {
        // The subscription may not be expanded on the session; fetch it fresh so
        // we apply real status + ids rather than guessing from the session.
        const session = event.data.object as Stripe.Checkout.Session;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subId) {
          const sub = await stripe().subscriptions.retrieve(subId);
          await applySubscriptionState(sub);
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged (200) so Stripe stops retrying.
        break;
    }
  } catch {
    // A processing error → 500 so Stripe retries; the handler is idempotent.
    return NextResponse.json({ error: "Failed to process event." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
