import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { listBrands } from "@/lib/db/brands";
import { listPendingInvites } from "@/lib/db/invites";
import { listTeamMembers } from "@/lib/db/workspaces";
import { isStripeConfigured } from "@/lib/stripe";
import { getAppContext } from "@/lib/workspace-context";
import { PLANS, limitLabel, planFor } from "@/services/plans";

import { ManageBillingButton, UpgradeButton } from "./billing-client";

export const metadata = { title: "Billing — Signal" };

/**
 * Settings → Billing. Shows the current plan, usage against its limits, and the
 * upgrade / manage actions (admin-only). Subscription state is the mirror of
 * Stripe kept in sync by the webhook — this page never calls Stripe to render.
 */
export default async function BillingPage() {
  const { workspace, role, brands } = await getAppContext();
  const isAdmin = role === "owner" || role === "admin";

  const [members, pending] = await Promise.all([
    listTeamMembers(workspace.id),
    listPendingInvites(workspace.id),
  ]);

  const plan = planFor(workspace.plan);
  const brandCount = brands.length || (await listBrands(workspace.id)).length;
  const seatCount = members.length + pending.length;
  const stripeReady = isStripeConfigured();

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="text-[1.1rem] font-bold tracking-[-0.01em]">{plan.name} plan</h2>
        {workspace.plan === "pro" ? (
          <Chip variant={statusVariant(workspace.subscriptionStatus)}>
            {statusLabel(workspace.subscriptionStatus)}
          </Chip>
        ) : (
          <Chip variant="draft">{plan.priceLabel}</Chip>
        )}
      </div>
      <p className="text-text-2 mb-5 text-[0.85rem]">
        {workspace.plan === "pro"
          ? renewalLine(workspace.subscriptionStatus, workspace.currentPeriodEnd)
          : "You're on the free plan."}
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <UsageCard label="Brands" value={limitLabel(brandCount, plan.maxBrands)} />
        <UsageCard label="Team seats" value={limitLabel(seatCount, plan.maxSeats)} />
      </div>

      {!stripeReady ? (
        <Card>
          <p className="text-[0.9rem] font-semibold">
            Billing isn&rsquo;t set up on this deployment
          </p>
          <p className="text-text-2 mt-1 text-[0.84rem] leading-relaxed">
            Add the Stripe keys (<code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code>,{" "}
            <code>STRIPE_PRICE_PRO</code>) to enable upgrades. Until then everything runs on the
            free plan.
          </p>
        </Card>
      ) : workspace.plan === "pro" ? (
        <Card>
          <p className="mb-3 text-[0.9rem] font-semibold">Manage your subscription</p>
          <p className="text-text-2 mb-4 text-[0.84rem] leading-relaxed">
            Update your card, download invoices, or cancel — all through Stripe&rsquo;s secure
            portal.
          </p>
          {isAdmin ? (
            <ManageBillingButton />
          ) : (
            <p className="text-text-2 text-[0.82rem]">Only an admin can manage billing.</p>
          )}
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <PlanCard planKey="free" current />
          <PlanCard planKey="pro" cta={isAdmin ? <UpgradeButton /> : undefined} />
        </div>
      )}
    </>
  );
}

function UsageCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-surface rounded-xl border p-4">
      <p className="text-text-2 text-[0.76rem] font-medium">{label}</p>
      <p className="mt-1 text-[1.3rem] font-bold tracking-[-0.01em] tabular-nums">{value}</p>
    </div>
  );
}

function PlanCard({
  planKey,
  current,
  cta,
}: {
  planKey: "free" | "pro";
  current?: boolean;
  cta?: React.ReactNode;
}) {
  const plan = PLANS[planKey];
  return (
    <Card className={planKey === "pro" ? "border-accent" : undefined}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-semibold">{plan.name}</h3>
        <span className="text-[0.9rem] font-bold">{plan.priceLabel}</span>
      </div>
      <ul className="text-text-2 mb-4 space-y-1.5 text-[0.84rem]">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="text-success">✓</span>
            {f}
          </li>
        ))}
      </ul>
      {current ? <p className="text-text-2 text-[0.82rem] font-semibold">Current plan</p> : cta}
    </Card>
  );
}

function statusVariant(status?: string) {
  if (status === "active" || status === "trialing") return "pub" as const;
  if (status === "past_due" || status === "unpaid") return "pend" as const;
  return "draft" as const;
}

function statusLabel(status?: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "trialing":
      return "Trial";
    case "past_due":
      return "Payment due";
    case "unpaid":
      return "Unpaid";
    case "canceled":
      return "Cancelled";
    default:
      return "Pro";
  }
}

function renewalLine(status: string | undefined, periodEnd: string | undefined): string {
  if (!periodEnd) return "Thanks for being on Pro.";
  const date = new Date(periodEnd).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return status === "canceled" ? `Access ends ${date}.` : `Renews ${date}.`;
}
