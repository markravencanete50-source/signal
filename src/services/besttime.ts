import type { Platform } from "@/types";

/**
 * Best-time engine — PURE. No I/O, no Claude, no Firestore. It takes a brand's
 * own post metrics and returns the top slots, or labelled generic benchmarks
 * when there isn't enough history yet.
 *
 * This purity is the point of keeping services separate from lib: the whole
 * thing is unit-testable with a plain array, no emulator.
 */

export interface PostTiming {
  /** When the post went out, in the brand's local timezone already applied. */
  weekday: number; // 0=Sun … 6=Sat
  hour: number; // 0–23
  /** The post's intent score — the weight for the heatmap. */
  intentScore: number;
}

export interface TimeSlot {
  weekday: number;
  hour: number;
  label: string;
  /** True when derived from the brand's own data rather than a benchmark. */
  personalised: boolean;
}

/** Below this many scored posts, we don't trust the brand's own heatmap yet. */
const MIN_HISTORY = 20;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Platform benchmarks, used until a brand has ≥20 scored posts. Labelled
 * "generic until we learn your audience" in the UI so nobody mistakes them for
 * personalised insight.
 */
const BENCHMARKS: Record<Platform, Array<{ weekday: number; hour: number }>> = {
  ig: [
    { weekday: 4, hour: 11 }, // Thu 11:00
    { weekday: 2, hour: 13 }, // Tue 13:00
    { weekday: 6, hour: 19 }, // Sat 19:00
  ],
  fb: [
    { weekday: 3, hour: 9 }, // Wed 09:00
    { weekday: 5, hour: 13 }, // Fri 13:00
    { weekday: 0, hour: 19 }, // Sun 19:00
  ],
};

function formatSlot(weekday: number, hour: number, personalised: boolean): TimeSlot {
  const hh = hour.toString().padStart(2, "0");
  return {
    weekday,
    hour,
    label: `${WEEKDAYS[weekday]} ${hh}:00`,
    personalised,
  };
}

/**
 * Top-3 posting slots.
 *
 * With enough history: bucket the brand's posts by weekday×hour into an
 * engagement-weighted heatmap (summing intent scores) and return the three
 * heaviest buckets. Weighting by intent — not raw post count — means a slot the
 * brand happened to post to often but which underperformed doesn't win.
 *
 * Below the history threshold: platform benchmarks, flagged non-personalised.
 */
export function bestTimeSlots(timings: PostTiming[], platform: Platform): TimeSlot[] {
  if (timings.length < MIN_HISTORY) {
    return BENCHMARKS[platform].map((b) => formatSlot(b.weekday, b.hour, false));
  }

  // key "weekday:hour" → summed intent score
  const buckets = new Map<string, number>();
  for (const t of timings) {
    const key = `${t.weekday}:${t.hour}`;
    buckets.set(key, (buckets.get(key) ?? 0) + t.intentScore);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => {
      const [weekday, hour] = key.split(":").map(Number) as [number, number];
      return formatSlot(weekday, hour, true);
    });
}
