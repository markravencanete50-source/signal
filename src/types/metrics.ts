import type { Platform } from "./index";

/**
 * Analytics domain types — the synced, aggregated shapes the sync engine writes
 * and the Analytics/Dashboard/Pulse views read. Kept out of the main barrel so
 * the platform-metric detail doesn't leak everywhere.
 */

/** Per-post metrics, one doc per `postId_platform`. */
export interface PostMetrics {
  postId: string;
  brandId: string;
  workspaceId: string;
  platform: Platform;
  syncedAt: string;
  /** The post's external id on the platform, so re-syncs re-fetch the same post. */
  externalId: string;
  /** Original caption snippet + format, for the analytics table. */
  title: string;
  format: "image" | "video" | "carousel";
  publishedAt: string;

  likes: number;
  comments: number;
  saves?: number;
  shares: number;
  reach: number;
  reachNonFollowers?: number;
  watchTimeAvg?: number;
  completionRate?: number;
  profileClicks?: number;

  /** Computed by services/intent.ts. */
  intentScore: number;
}

/** Daily account rollup, one doc per `brandId_platform_date`. */
export interface MetricsDaily {
  brandId: string;
  workspaceId: string;
  platform: Platform;
  date: string; // YYYY-MM-DD
  followers: number;
  reach: number;
  impressions: number;
  engagement: number;
  profileViews: number;
}

export interface Anomaly {
  id: string;
  workspaceId: string;
  brandId: string | null;
  platform: Platform;
  detectedAt: string;
  dropPct: number;
  verdict: "platform_side" | "content_side";
  reasoning: string;
  resolvedAt?: string;
}

/** Admin-curated platform-changes feed item (Pulse). */
export interface PlatformChange {
  id: string;
  workspaceId: string;
  period: string; // free text, e.g. "Jun 2026"
  body: string;
  createdAt: string;
  createdBy: string;
}
