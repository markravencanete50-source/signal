"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/icons";

import { createWorkspaceAction, type OnboardingState } from "./actions";

/**
 * Workspace creation form.
 *
 * `useActionState` + `useFormStatus` rather than manual fetch/state: the form
 * posts to the server action directly, so it still works before hydration and
 * the pending state comes from React rather than a hand-rolled boolean.
 */
export function OnboardingForm() {
  const [state, formAction] = useActionState<OnboardingState, FormData>(createWorkspaceAction, {});

  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-7 flex items-center gap-[10px]">
        <div className="bg-accent text-accent-fg grid size-[30px] place-items-center rounded-[9px]">
          <LogoMark />
        </div>
        <span className="font-display text-[1.15rem] font-bold tracking-[-0.02em]">Signal</span>
      </div>

      <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Set up your workspace</h1>
      <p className="text-text-2 mt-[3px] mb-6 text-[0.88rem]">
        A workspace holds your team and every brand you manage. You can add more brands later.
      </p>

      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.78rem] font-semibold">Workspace name</span>
          <input
            name="workspaceName"
            required
            maxLength={60}
            placeholder="Optimal Offshore"
            className="border-border bg-surface placeholder:text-text-2 rounded-[10px] border px-3 py-2.5 text-[0.88rem] outline-none"
          />
          <span className="text-text-2 text-[0.72rem]">Usually your agency name.</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.78rem] font-semibold">First brand</span>
          <input
            name="brandName"
            required
            maxLength={60}
            placeholder="House of Lettings"
            className="border-border bg-surface placeholder:text-text-2 rounded-[10px] border px-3 py-2.5 text-[0.88rem] outline-none"
          />
          <span className="text-text-2 text-[0.72rem]">
            A brand is one client — its own accounts, content and reports.
          </span>
        </label>

        {state.error && (
          <p role="alert" className="text-danger text-[0.8rem] font-medium">
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>
    </div>
  );
}

/**
 * Must be a child of <form> — useFormStatus reads the nearest parent form's
 * pending state, and returns false if called in the same component that renders it.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Creating…" : "Create workspace"}
    </Button>
  );
}
