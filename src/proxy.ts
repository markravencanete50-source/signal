import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session-cookie";

/**
 * Optimistic auth redirect. **Not** an authorisation boundary.
 *
 * (Next 16 renamed `middleware.ts` to `proxy.ts`; same functionality.)
 *
 * This runs on every request including prefetches, so it only checks whether a
 * session cookie is *present* — it never verifies it and never touches
 * Firestore. A forged cookie sails straight through here by design; the real
 * check is `verifySession()` in the DAL, next to the data, plus Firestore rules
 * underneath that.
 *
 * Its only job is UX: bounce obviously-signed-out users to /login instead of
 * rendering a shell that will fail, and keep signed-in users off the login page.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);

  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (!hasSessionCookie && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Preserve where they were headed so login can return them there. Only the
    // path+query is carried — never an absolute URL, which would make this an
    // open redirect into an attacker's origin.
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }

  if (hasSessionCookie && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Matches everything except Next internals, static assets, and the public
   * surfaces that must work signed-out:
   *   - /api/*     — route handlers authorise themselves (cron secret, webhook
   *                  signature, session); a redirect here would break them
   *   - /r/*             — white-label public reports, no auth by design
   *   - /approve/*       — one-click email approval, no login by design
   *   - /s/*             — public SmartLink (link-in-bio) pages, no auth by design
   *   - /data-deletion/* — public Meta data-deletion status page, no auth by design
   *   - /_next/*, favicon, images — static
   *
   * The trailing `.*\\.[\\w]+$` clause excludes any file-with-extension so real
   * files (og images, manifests) pass through without a redirect.
   */
  matcher: [
    "/((?!api|r/|approve/|s/|data-deletion/|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)",
  ],
};
