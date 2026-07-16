import { describe, expect, it } from "vitest";

import { decideRetry, MAX_ATTEMPTS } from "@/services/publish-policy";
import { bestTimeSlots, type PostTiming } from "@/services/besttime";

/**
 * Pure-service unit tests. These need no emulator — they're the payoff of
 * keeping `services/` free of I/O (DECISIONS #010/#013).
 */

describe("publish retry policy", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("schedules a retry after the first failure", () => {
    const d = decideRetry(1, now);
    expect(d.exhausted).toBe(false);
    expect(d.nextAttemptAt).toBeDefined();
    // Second attempt waits 5 minutes.
    expect(new Date(d.nextAttemptAt!).getTime()).toBe(now.getTime() + 5 * 60_000);
  });

  it("schedules a longer retry after the second failure", () => {
    const d = decideRetry(2, now);
    expect(d.exhausted).toBe(false);
    // Third attempt waits 15 minutes.
    expect(new Date(d.nextAttemptAt!).getTime()).toBe(now.getTime() + 15 * 60_000);
  });

  it("gives up after the max attempts", () => {
    const d = decideRetry(MAX_ATTEMPTS, now);
    expect(d.exhausted).toBe(true);
    expect(d.nextAttemptAt).toBeUndefined();
  });
});

describe("best-time engine", () => {
  it("returns labelled benchmarks below the history threshold", () => {
    const slots = bestTimeSlots([], "ig");
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => !s.personalised)).toBe(true);
  });

  it("returns the highest-intent buckets with enough history", () => {
    // 25 posts, all Thu 11:00 with high scores except a few noisy low ones.
    const timings: PostTiming[] = [];
    for (let i = 0; i < 25; i++) {
      timings.push({ weekday: 4, hour: 11, intentScore: 90 });
    }
    // A frequently-used but low-scoring slot must not beat the high one.
    for (let i = 0; i < 5; i++) {
      timings.push({ weekday: 1, hour: 8, intentScore: 10 });
    }

    const slots = bestTimeSlots(timings, "ig");
    expect(slots[0]).toMatchObject({ weekday: 4, hour: 11, personalised: true });
    expect(slots[0]!.label).toBe("Thu 11:00");
  });
});
