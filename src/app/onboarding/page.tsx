import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/dal";
import { listWorkspacesForUser } from "@/lib/db/workspaces";

import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Set up your workspace — Signal" };

/**
 * First-run: create a workspace and its first brand.
 *
 * Outside the `(app)` group on purpose — the shell needs a workspace to render
 * (brand switcher, nav), so onboarding cannot live inside it without a chicken
 * and egg. Users who already have a workspace are bounced straight out.
 */
export default async function OnboardingPage() {
  const session = await requireSession();
  const workspaces = await listWorkspacesForUser(session.uid);
  if (workspaces.length > 0) redirect("/dashboard");

  return (
    <div className="bg-bg flex min-h-screen items-center justify-center px-5 py-12">
      <OnboardingForm />
    </div>
  );
}
