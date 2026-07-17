import "server-only";

import { z } from "zod";

/**
 * Server-side environment contract.
 *
 * Importing this module from client code is a build error (`server-only`), which
 * is the point: it holds the Meta app secret, the LLM API keys and the token
 * encryption key, none of which may ever reach a browser bundle.
 *
 * Validation is lazy (see `env()` below) rather than at module load. A top-level
 * parse would crash `next build` on any machine without a full secret set —
 * including Vercel Preview builds and CI — even though those builds never
 * execute the code paths that need them. Lee has been bitten by exactly this
 * before: env vars scoped Production-only took down Preview at module load.
 */
const serverSchema = z.object({
  // Firebase Admin
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().email(),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1),

  // Meta
  META_APP_ID: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  // Resend
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  // LLM — OPTIONAL. AI degrades gracefully with neither set (see `isAiConfigured`
  // in lib/llm): the Composer works without predicted scores, Ask Signal returns
  // a friendly "not configured" message, etc. Groq is primary, OpenRouter the
  // fallback; either alone is enough to switch AI on.
  GROQ_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),

  // App — the absolute origin used to build OAuth redirect URIs, invite/approval
  // links, public report URLs, SmartLink targets and Stripe return URLs.
  //
  // Set it explicitly (it must match the URI registered with Meta for OAuth). If
  // it's ever unset, fall back to Vercel's *stable* production domain
  // (VERCEL_PROJECT_PRODUCTION_URL — the production host, constant across
  // deployments, unlike the per-deploy VERCEL_URL) so links still resolve instead
  // of the whole env failing to parse. Explicit APP_URL always wins.
  APP_URL: z.preprocess((v) => {
    if (typeof v === "string" && v.length > 0) return v;
    const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return prod ? `https://${prod}` : v;
  }, z.string().url()),

  // AES-256-GCM needs exactly 32 bytes; as hex that is 64 chars. Enforced here
  // because a short key fails deep inside node:crypto with an opaque error.
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "TOKEN_ENCRYPTION_KEY must be 32 bytes of hex (64 chars)"),

  CRON_SECRET: z.string().min(1),

  // Stripe — OPTIONAL. Billing is a drop-in: with these unset the app runs
  // exactly as before and the Billing screen shows an "unconfigured" state,
  // mirroring how AI degrades without an LLM key. Only `stripe()` and the
  // billing routes read them, so their absence never breaks publish/sync/etc.
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_PRO: z.string().min(1).optional(),

  USE_MOCK_ADAPTERS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Parse and memoise the server environment.
 *
 * Call this inside a request handler, cron route or service — never at module
 * scope — so a missing secret surfaces as a failed request with a precise
 * message rather than a build that won't compile.
 */
export function env(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(
      `Invalid server environment.\n${missing.join("\n")}\n\nSee .env.example for the full contract.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * True when the app should use MockAdapter instead of the live Graph API.
 *
 * Read directly rather than through `env()` so the whole app stays demoable
 * before Meta App Review clears, without every other secret being present.
 *
 * Named `isMockMode`, NOT `useMockAdapters`: a `use` prefix makes ESLint's
 * rules-of-hooks treat a plain function as a React hook and reject it in async
 * server components and non-component functions.
 */
export function isMockMode(): boolean {
  return process.env.USE_MOCK_ADAPTERS !== "false";
}
