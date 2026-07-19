import { describe, expect, it } from "vitest";

import {
  MAX_VERIFY_ATTEMPTS,
  VERIFY_DELAY_MINUTES,
  decideVerifyRetry,
  verifyDueAt,
} from "@/services/publish-verify";

const MIN = 60_000;

describe("verifyDueAt", () => {
  it("schedules the first check VERIFY_DELAY_MINUTES after publish", () => {
    const published = Date.parse("2026-07-19T10:00:00.000Z");
    expect(verifyDueAt(published)).toBe(
      new Date(published + VERIFY_DELAY_MINUTES * MIN).toISOString(),
    );
  });
});

describe("decideVerifyRetry", () => {
  const now = new Date("2026-07-19T10:00:00.000Z");

  it("backs off 5m after the first transient attempt", () => {
    const d = decideVerifyRetry(1, now);
    expect(d.exhausted).toBe(false);
    expect(d.nextDueAt).toBe(new Date(now.getTime() + 5 * MIN).toISOString());
  });

  it("backs off 15m after the second", () => {
    const d = decideVerifyRetry(2, now);
    expect(d.exhausted).toBe(false);
    expect(d.nextDueAt).toBe(new Date(now.getTime() + 15 * MIN).toISOString());
  });

  it("gives up once attempts reach the cap", () => {
    expect(decideVerifyRetry(MAX_VERIFY_ATTEMPTS, now)).toEqual({ exhausted: true });
    expect(decideVerifyRetry(MAX_VERIFY_ATTEMPTS + 1, now).exhausted).toBe(true);
  });
});
