import { describe, expect, it } from "vitest";

import {
  canAddBrand,
  canAddSeat,
  isActiveStatus,
  limitLabel,
  resolvePlanState,
} from "@/services/plans";

describe("resolvePlanState", () => {
  it("grants Pro for live statuses", () => {
    for (const status of ["active", "trialing", "past_due"] as const) {
      expect(resolvePlanState(status)).toEqual({ plan: "pro", subscriptionStatus: status });
    }
  });

  it("drops to Free for ended statuses", () => {
    for (const status of ["canceled", "unpaid", "incomplete_expired", "paused"] as const) {
      expect(resolvePlanState(status).plan).toBe("free");
    }
  });

  it("keeps past_due on Pro (dunning grace, not an instant downgrade)", () => {
    expect(resolvePlanState("past_due").plan).toBe("pro");
  });
});

describe("isActiveStatus", () => {
  it("is false for undefined", () => {
    expect(isActiveStatus(undefined)).toBe(false);
  });
});

describe("plan limits", () => {
  it("caps brands on Free but not Pro", () => {
    expect(canAddBrand("free", 0)).toBe(true);
    expect(canAddBrand("free", 1)).toBe(false);
    expect(canAddBrand("pro", 999)).toBe(true);
  });

  it("caps seats on Free but not Pro", () => {
    expect(canAddSeat("free", 2)).toBe(true);
    expect(canAddSeat("free", 3)).toBe(false);
    expect(canAddSeat("pro", 999)).toBe(true);
  });
});

describe("limitLabel", () => {
  it("shows the used/max, with ∞ for unlimited", () => {
    expect(limitLabel(1, 3)).toBe("1 / 3");
    expect(limitLabel(5, Infinity)).toBe("5 / ∞");
  });
});
