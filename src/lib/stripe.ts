import "server-only";

import Stripe from "stripe";

/**
 * Stripe client + configuration gate.
 *
 * The single choke point for the Stripe SDK (mirrors how `adapters/` is the only
 * place that touches the Graph API and `lib/claude` the only place that calls
 * Anthropic). Server-side only — the secret key never reaches a browser. Lazily
 * constructed so a build, or a deployment with billing switched off, still works.
 */

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export class BillingUnavailableError extends Error {
  constructor() {
    super("Billing is not configured (STRIPE_SECRET_KEY is unset).");
    this.name = "BillingUnavailableError";
  }
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new BillingUnavailableError();
  // Pin nothing: let the installed SDK use its default API version, so an SDK
  // bump doesn't need a matching string here. We only read stable fields.
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}
