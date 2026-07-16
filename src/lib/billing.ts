import "server-only";

import type Stripe from "stripe";

import { recordAudit } from "./db/audit";
import { getWorkspace, getWorkspaceByStripeCustomer, setWorkspaceBilling } from "./db/workspaces";
import { env } from "./env";
import { stripe } from "./stripe";
import { resolvePlanState } from "@/services/plans";
import type { SubscriptionStatus, Workspace } from "@/types";

/**
 * Billing operations — Checkout, the customer Portal, and applying webhook state.
 *
 * Everything that talks to Stripe funnels through `lib/stripe`; this module is
 * the business layer over it. A workspace is the billing entity (the agency),
 * never an individual user — one subscription per workspace.
 */

/** Get or lazily create the workspace's Stripe customer, denormalising its id. */
export async function ensureCustomer(workspace: Workspace, email?: string): Promise<string> {
  if (workspace.stripeCustomerId) return workspace.stripeCustomerId;

  const customer = await stripe().customers.create({
    name: workspace.name,
    email,
    metadata: { workspaceId: workspace.id },
  });
  await setWorkspaceBilling(workspace.id, { stripeCustomerId: customer.id });
  return customer.id;
}

/** Start a subscription Checkout for the Pro plan; returns the redirect URL. */
export async function createCheckoutSession(workspace: Workspace, email?: string): Promise<string> {
  const priceId = env().STRIPE_PRICE_PRO;
  if (!priceId) throw new Error("No Pro price is configured (set STRIPE_PRICE_PRO).");

  const customer = await ensureCustomer(workspace, email);
  const base = env().APP_URL;

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/settings/billing?checkout=success`,
    cancel_url: `${base}/settings/billing?checkout=cancelled`,
    allow_promotion_codes: true,
    // Stamp the workspace on both objects so the webhook can resolve it even if
    // the customer lookup ever misses.
    metadata: { workspaceId: workspace.id },
    subscription_data: { metadata: { workspaceId: workspace.id } },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

/** Open the Stripe customer Portal (manage/cancel); returns the redirect URL. */
export async function createPortalSession(workspace: Workspace): Promise<string> {
  if (!workspace.stripeCustomerId) {
    throw new Error("This workspace has no billing account yet.");
  }
  const session = await stripe().billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: `${env().APP_URL}/settings/billing`,
  });
  return session.url;
}

/**
 * Apply a subscription's current state to its workspace. Idempotent — it just
 * writes the derived plan/status, so a replayed webhook is harmless. Resolves the
 * workspace from subscription metadata first, then the customer id.
 */
export async function applySubscriptionState(sub: Stripe.Subscription): Promise<void> {
  const workspaceId = await resolveWorkspaceId(sub);
  if (!workspaceId) return;

  const { plan, subscriptionStatus } = resolvePlanState(sub.status as SubscriptionStatus);

  // Audit only a real plan transition, not every subscription.updated ping.
  const previous = (await getWorkspace(workspaceId))?.plan;

  await setWorkspaceBilling(workspaceId, {
    plan,
    subscriptionStatus,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    currentPeriodEnd: periodEndIso(sub),
  });

  if (previous && previous !== plan) {
    await recordAudit({
      workspaceId,
      actorId: "stripe",
      actorName: "Stripe",
      action: "plan.changed",
      target: `${previous} → ${plan}`,
      metadata: { subscriptionStatus },
    }).catch(() => {});
  }
}

async function resolveWorkspaceId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.workspaceId;
  if (fromMeta) return fromMeta;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const ws = await getWorkspaceByStripeCustomer(customerId);
  return ws?.id ?? null;
}

/**
 * Period end lives at the subscription top level in older API versions and on the
 * item in newer ones; read either. Display-only, so a miss just omits it.
 */
function periodEndIso(sub: Stripe.Subscription): string | undefined {
  type WithPeriod = { current_period_end?: number };
  const top = (sub as unknown as WithPeriod).current_period_end;
  const item = (sub.items?.data?.[0] as unknown as WithPeriod | undefined)?.current_period_end;
  const secs = top ?? item;
  return typeof secs === "number" ? new Date(secs * 1000).toISOString() : undefined;
}
