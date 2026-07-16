"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * App-shell error boundary.
 *
 * Catches ForbiddenError from the DAL (a client hitting a team-only route) and
 * anything else thrown during render. Deliberately generic copy — an error page
 * that echoes internal messages leaks structure. The real detail goes to the
 * console/logs for the developer.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App shell error:", error);
  }, [error]);

  const isForbidden = error.name === "ForbiddenError";

  return (
    <div className="grid min-h-[60vh] place-items-center px-5">
      <div className="max-w-[380px] text-center">
        <h1 className="text-[1.4rem] font-bold tracking-[-0.02em]">
          {isForbidden ? "You don't have access to this" : "Something went wrong"}
        </h1>
        <p className="text-text-2 mx-auto mt-2 text-[0.88rem]">
          {isForbidden
            ? "This area is limited to your team. If you think you should have access, ask a workspace admin."
            : "That page hit an unexpected error. Trying again often clears it."}
        </p>
        <div className="mt-5 flex justify-center gap-2.5">
          {!isForbidden && <Button onClick={reset}>Try again</Button>}
          <a
            href="/dashboard"
            className="border-border bg-surface hover:bg-surface-2 inline-flex items-center rounded-[10px] border px-4 py-[9px] text-[0.88rem] font-semibold"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
