import { redirect } from "next/navigation";

/**
 * Root. There is no marketing landing page yet, so route straight to the app —
 * proxy.ts bounces signed-out users to /login, and getAppContext sends users
 * with no workspace to onboarding. This keeps a single source of truth for those
 * redirects rather than duplicating the checks here.
 */
export default function RootPage() {
  redirect("/dashboard");
}
