"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { openBillingPortal, startCheckout, type BillingState } from "./actions";

/** "Upgrade to Pro" — kicks off Stripe Checkout. */
export function UpgradeButton() {
  const [state, action] = useActionState<BillingState, FormData>(startCheckout, {});
  return (
    <form action={action}>
      <SubmitButton idle="Upgrade to Pro" busy="Redirecting…" primary />
      {state.error && (
        <p role="alert" className="text-danger mt-2 text-[0.8rem] font-medium">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** "Manage billing" — opens the Stripe customer Portal. */
export function ManageBillingButton() {
  const [state, action] = useActionState<BillingState, FormData>(openBillingPortal, {});
  return (
    <form action={action}>
      <SubmitButton idle="Manage billing" busy="Opening…" />
      {state.error && (
        <p role="alert" className="text-danger mt-2 text-[0.8rem] font-medium">
          {state.error}
        </p>
      )}
    </form>
  );
}

function SubmitButton({ idle, busy, primary }: { idle: string; busy: string; primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        primary
          ? "bg-accent text-accent-fg rounded-[10px] px-4 py-2 text-[0.88rem] font-semibold disabled:opacity-60"
          : "border-border text-text-1 hover:bg-surface-2 rounded-[10px] border px-4 py-2 text-[0.88rem] font-semibold disabled:opacity-60"
      }
    >
      {pending ? busy : idle}
    </button>
  );
}
