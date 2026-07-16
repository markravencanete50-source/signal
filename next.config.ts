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
};

export default nextConfig;
