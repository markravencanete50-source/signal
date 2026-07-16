import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Sign in — Signal",
};

export default function LoginPage() {
  return (
    // AuthForm reads the ?next= param via useSearchParams, which opts the route
    // into client-side rendering. The Suspense boundary keeps that scoped to the
    // form rather than de-opting the whole page.
    <Suspense fallback={null}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
