import type { PlanId, SubscriptionStatus } from "@/types";

/**
 * Plan catalogue + limit checks — pure, so gating and the billing UI read the
 * same source and it unit-tests without Stripe or Firestore.
 *
 * Prices live in Stripe (the price id is an env var); the `priceLabel` here is
 * display-only. Limits are deliberately in ONE place so tuning a tier is a
 * one-line change — the whole point of keeping billing a drop-in.
 *
 * NOTE: the specific numbers (1 brand / 3 seats on Free, the Pro price) are
 * sensible placeholders — see DECISIONS. Change them here and in Stripe.
 */

export interface Plan {
  id: PlanId;
  name: string;
  /** Display only; the real charge is the Stripe price. */
  priceLabel: string;
  /** Max brands / team seats. `Infinity` = unlimited. */
  maxBrands: number;
  maxSeats: number;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceLabel: "£0",
    maxBrands: 1,
    maxSeats: 3,
    features: ["1 brand", "3 team seats", "Publishing, analytics & AI"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceLabel: "£49 / mo",
    maxBrands: Infinity,
    maxSeats: Infinity,
    features: [
      "Unlimited brands",
      "Unlimited seats",
      "Reports, SmartLink & Autolists",
      "Priority support",
    ],
  },
};

export function planFor(id: PlanId): Plan {
  return PLANS[id];
}

/** A Stripe subscription is "live" (grants the paid plan) in these states. */
export function isActiveStatus(status: SubscriptionStatus | undefined): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

/**
 * Resolve the effective plan + stored status from a Stripe subscription status.
 * `past_due` keeps Pro (a failed payment shouldn't instantly downgrade mid-cycle
 * — Stripe dunning gets a chance); a truly ended subscription drops to Free.
 */
export function resolvePlanState(status: SubscriptionStatus): {
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
} {
  return { plan: isActiveStatus(status) ? "pro" : "free", subscriptionStatus: status };
}

export function canAddBrand(plan: PlanId, currentBrandCount: number): boolean {
  return currentBrandCount < PLANS[plan].maxBrands;
}

export function canAddSeat(plan: PlanId, currentSeatCount: number): boolean {
  return currentSeatCount < PLANS[plan].maxSeats;
}

/** For the UI: "1 / 3" or "2 / ∞". */
export function limitLabel(used: number, max: number): string {
  return `${used} / ${max === Infinity ? "∞" : max}`;
}
