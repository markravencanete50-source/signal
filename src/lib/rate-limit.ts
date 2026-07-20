import { NextResponse } from "next/server";

/**
 * Rate limiting — fixed-window counters, in-process.
 *
 * Scope, honestly stated: this runs in serverless function memory, so counters
 * are PER WARM INSTANCE, not global. That still blunts the attacks that matter
 * at this scale — scripted bursts, AI-quota burn, click-flooding, credential
 * stuffing — because a burst rides one warm instance. It is defence-in-depth on
 * top of auth, not a billing-grade global quota. If Signal outgrows it, swap
 * `defaultLimiter` for a distributed store (e.g. Upstash Redis) behind the same
 * `consume()` signature; every call site stays unchanged.
 *
 * Keying: authenticated surfaces could key by uid, but every guarded route here
 * keys by client IP so the limit binds *before* any Firestore or LLM work runs
 * — the whole point is to shed abusive traffic cheaply. On Vercel,
 * `x-forwarded-for`'s first hop is set by the platform and not client-spoofable.
 *
 * No `"server-only"` import on purpose: the module is pure Node + `NextResponse`
 * so the unit tests can exercise the window logic directly.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets — the Retry-After value when blocked. */
  retryAfterSec: number;
}

/** Cap the map so a key-spraying attacker can't grow memory unboundedly. */
const MAX_KEYS = 10_000;

export interface RateLimiter {
  consume(key: string, limit: number, windowMs: number, now?: number): RateLimitResult;
}

/**
 * A fixed-window limiter. `now` is injectable so tests can drive the clock;
 * production callers omit it.
 */
export function createRateLimiter(): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function purgeExpired(now: number) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
    // Still over cap after purging (key-spray): drop oldest-inserted entries.
    if (buckets.size >= MAX_KEYS) {
      for (const k of buckets.keys()) {
        if (buckets.size < MAX_KEYS) break;
        buckets.delete(k);
      }
    }
  }

  return {
    consume(key, limit, windowMs, now = Date.now()): RateLimitResult {
      const existing = buckets.get(key);

      if (!existing || existing.resetAt <= now) {
        if (buckets.size >= MAX_KEYS) purgeExpired(now);
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
      }

      existing.count += 1;
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      if (existing.count > limit) {
        return { ok: false, remaining: 0, retryAfterSec };
      }
      return { ok: true, remaining: limit - existing.count, retryAfterSec };
    },
  };
}

/** The process-wide limiter every route shares. */
export const defaultLimiter = createRateLimiter();

/**
 * Per-surface limits. One window (a minute) everywhere keeps the mental model
 * simple; only the budget differs by how expensive/abusable the surface is.
 */
const WINDOW_MS = 60_000;
export const RATE_LIMITS = {
  /** LLM generation — the most expensive calls in the app (provider quota). */
  ai: 20,
  /** Session exchange — brake on token-stuffing against /api/auth/session. */
  auth: 10,
  /** Public click redirect — flooding inflates metrics + burns Firestore writes. */
  click: 60,
  /** Workspace search — fans out several Firestore queries per call. */
  search: 30,
  /** Media signing/registering — Cloudinary quota + Firestore writes. */
  media: 30,
  /** Public approval action — bearer-token guesses are hopeless (256-bit), but rejecting floods early is free. */
  approve: 10,
  /** Manual "Run sync now" — each call spends Meta Graph quota, which is per-APP and shared across every tenant. */
  sync: 2,
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/**
 * Client IP for rate-limit keying. On Vercel the platform writes the real
 * client IP as the first `x-forwarded-for` hop. "unknown" (local dev, exotic
 * proxies) still works — it just shares one bucket.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * Route-handler guard. Returns a 429 response to send back, or null to proceed.
 *
 *   const limited = enforceRateLimit(request, "ai");
 *   if (limited) return limited;
 */
export function enforceRateLimit(request: Request, bucket: RateLimitBucket): NextResponse | null {
  const result = checkRateLimit(request.headers, bucket);
  if (result.ok) return null;

  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
  );
}

/**
 * Header-level check for callers that can't return a NextResponse (server
 * actions). Same buckets, same limiter.
 */
export function checkRateLimit(headers: Headers, bucket: RateLimitBucket): RateLimitResult {
  const key = `${bucket}:${clientIp(headers)}`;
  return defaultLimiter.consume(key, RATE_LIMITS[bucket], WINDOW_MS);
}
