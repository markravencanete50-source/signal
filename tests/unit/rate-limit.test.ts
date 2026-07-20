import { describe, expect, it } from "vitest";

import { clientIp, createRateLimiter } from "../../src/lib/rate-limit";

/**
 * Rate limiter — pure fixed-window logic, driven with an injected clock.
 * The serverless caveat (per-instance counters) is architectural, not logical;
 * what must be correct here is the window math and the keying helper.
 */

describe("createRateLimiter", () => {
  it("allows up to the limit inside one window, then blocks", () => {
    const limiter = createRateLimiter();
    const t0 = 1_000_000;

    for (let i = 0; i < 5; i++) {
      expect(limiter.consume("k", 5, 60_000, t0 + i).ok).toBe(true);
    }
    const blocked = limiter.consume("k", 5, 60_000, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("resets after the window elapses", () => {
    const limiter = createRateLimiter();
    const t0 = 1_000_000;

    expect(limiter.consume("k", 1, 60_000, t0).ok).toBe(true);
    expect(limiter.consume("k", 1, 60_000, t0 + 1).ok).toBe(false);
    // One tick past resetAt → fresh window.
    expect(limiter.consume("k", 1, 60_000, t0 + 60_001).ok).toBe(true);
  });

  it("counts keys independently", () => {
    const limiter = createRateLimiter();
    const t0 = 1_000_000;

    expect(limiter.consume("a", 1, 60_000, t0).ok).toBe(true);
    expect(limiter.consume("a", 1, 60_000, t0 + 1).ok).toBe(false);
    expect(limiter.consume("b", 1, 60_000, t0 + 2).ok).toBe(true);
  });

  it("reports remaining budget as it drains", () => {
    const limiter = createRateLimiter();
    const t0 = 1_000_000;

    expect(limiter.consume("k", 3, 60_000, t0).remaining).toBe(2);
    expect(limiter.consume("k", 3, 60_000, t0 + 1).remaining).toBe(1);
    expect(limiter.consume("k", 3, 60_000, t0 + 2).remaining).toBe(0);
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for hop", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
