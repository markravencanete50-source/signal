import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Load `firebase-admin` from node_modules at runtime instead of letting the
   * bundler trace it. The Admin SDK pulls `jwks-rsa → jose`, and the bundler
   * resolves `jose`'s conditional exports to its ESM `webapi` build then
   * `require()`s it, throwing `ERR_REQUIRE_ESM` in the serverless runtime.
   * Externalising it defers to Node's resolver, which picks jose's CJS entry.
   * (The middleware avoids the SDK entirely — see `lib/auth/session-cookie.ts`.)
   */
  serverExternalPackages: ["firebase-admin"],

  /** Don't advertise the framework in every response. */
  poweredByHeader: false,

  /**
   * Security headers on every response.
   *
   * Notes on the choices:
   * - `frame-ancestors 'none'` + X-Frame-Options DENY: nothing in Signal is
   *   designed to be iframed — the app is session-authed (clickjacking target)
   *   and the public pages (/r, /s, /approve) are top-level link destinations.
   * - HSTS: Vercel serves HTTPS everywhere; pinning it stops downgrade attacks
   *   on first navigation after any http:// link.
   * - Permissions-Policy: Signal never uses camera/mic/geolocation; declaring
   *   that turns any future XSS that tries to reach them into a no-op.
   * - No full `script-src` CSP here: Next's inline runtime needs nonces/hashes
   *   to lock that down properly, which is its own project — the headers below
   *   are the uncontroversial, break-nothing layer.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
