import { describe, expect, it } from "vitest";

import {
  TOKEN_WARNING_THRESHOLDS,
  daysUntil,
  effectiveExpiryMs,
  shouldResetWarning,
  warningThresholdToFire,
} from "@/services/token-health";

const DAY = 86_400_000;

describe("effectiveExpiryMs", () => {
  it("returns the soonest of the two clocks", () => {
    expect(effectiveExpiryMs(100, 50)).toBe(50);
    expect(effectiveExpiryMs(50, 100)).toBe(50);
  });

  it("ignores 'never expires' (0 or negative) and nulls", () => {
    expect(effectiveExpiryMs(0, 90)).toBe(90);
    expect(effectiveExpiryMs(90, null)).toBe(90);
    expect(effectiveExpiryMs(null, 90)).toBe(90);
    expect(effectiveExpiryMs(-5, 90)).toBe(90);
  });

  it("returns null when neither clock has a real deadline", () => {
    expect(effectiveExpiryMs(0, 0)).toBeNull();
    expect(effectiveExpiryMs(null, null)).toBeNull();
  });
});

describe("daysUntil", () => {
  it("floors whole days remaining", () => {
    const now = 1_000_000_000_000;
    expect(daysUntil(now + 5 * DAY, now)).toBe(5);
    expect(daysUntil(now + 5 * DAY - 1, now)).toBe(4);
    expect(daysUntil(now - 2 * DAY, now)).toBe(-2);
  });
});

describe("warningThresholdToFire", () => {
  it("fires nothing when comfortably far out", () => {
    expect(warningThresholdToFire(30, null)).toBeNull();
    expect(warningThresholdToFire(15, null)).toBeNull();
  });

  it("fires the 14-day band first, then stays quiet within it", () => {
    expect(warningThresholdToFire(13, null)).toBe(14);
    // Already warned at 14; days 8-14 must not re-warn.
    expect(warningThresholdToFire(10, 14)).toBeNull();
    expect(warningThresholdToFire(8, 14)).toBeNull();
  });

  it("escalates to stricter bands as expiry nears", () => {
    expect(warningThresholdToFire(7, 14)).toBe(7);
    expect(warningThresholdToFire(3, 7)).toBe(3);
    expect(warningThresholdToFire(1, 3)).toBe(1);
    expect(warningThresholdToFire(0, 3)).toBe(1);
  });

  it("does not re-fire a band already warned at (or stricter)", () => {
    expect(warningThresholdToFire(3, 3)).toBeNull();
    expect(warningThresholdToFire(5, 3)).toBeNull(); // warned at 3, now in the 7 band — already past it
  });

  it("jumps straight to the strictest crossed band if warnings were missed", () => {
    // Never warned, but suddenly only 1 day left (e.g. a check was skipped).
    expect(warningThresholdToFire(1, null)).toBe(1);
  });
});

describe("shouldResetWarning", () => {
  it("resets only when beyond the widest band", () => {
    expect(shouldResetWarning(Math.max(...TOKEN_WARNING_THRESHOLDS) + 1)).toBe(true);
    expect(shouldResetWarning(Math.max(...TOKEN_WARNING_THRESHOLDS))).toBe(false);
    expect(shouldResetWarning(3)).toBe(false);
  });
});
