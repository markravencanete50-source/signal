/**
 * The session cookie name, isolated in its own import-free leaf module.
 *
 * `proxy.ts` (the middleware) needs this constant, but must NOT drag in
 * `firebase-admin`: bundling the Admin SDK into the middleware pulls its
 * `jwks-rsa → jose` chain, which fails at runtime with `ERR_REQUIRE_ESM`
 * (Turbopack resolves `jose` to its ESM build and then `require()`s it), and
 * that crashed every request in production. Keeping the name here, with zero
 * imports, keeps the middleware bundle lean. Same reasoning as `brand-cookie.ts`.
 */
export const SESSION_COOKIE = "__session";
