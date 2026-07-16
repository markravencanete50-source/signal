"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dal";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import { isStripeConfigured } from "@/lib/stripe";
import { getAppContext } from "@/lib/workspace-context";

/**
 * Billing actions — start a subscription Checkout or open the customer Portal.
 * Admin-only (billing is a workspace-level, money-moving concern). Both redirect
 * to a Stripe-hosted page; the card details are entered on Stripe, never here.
 */

export type BillingState = { error?: string };

export async function startCheckout(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  if (!isStripeConfigured()) return { error: "Billing isn't set up on this deployment yet." };

  let url: string;
  try {
    const { workspace, user } = await getAppContext();
    await requireAdmin(workspace.id);
    url = await createCheckoutSession(workspace, user.email);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start checkout." };
  }
  redirect(url);
}

export async function openBillingPortal(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  if (!isStripeConfigured()) return { error: "Billing isn't set up on this deployment yet." };

  let url: string;
  try {
    const { workspace } = await getAppContext();
    await requireAdmin(workspace.id);
    url = await createPortalSession(workspace);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the billing portal." };
  }
  redirect(url);
}
