import type { Connection, Platform, PostVariant, Sentiment } from "@/types";

/**
 * The platform adapter contract.
 *
 * This is the seam that makes a new platform a drop-in. **Adapters are the only
 * files in the codebase allowed to import a platform SDK or call a platform
 * HTTP API.** Services consume the normalised shapes below and stay pure, so
 * adding TikTok means writing one file that satisfies this interface — not
 * touching the publish engine, the sync engine, or any UI.
 *
 * Every method takes an already-decrypted `Connection`; adapters never touch
 * encryption, Firestore or the token store.
 */

export interface TokenSet {
  accessToken: string;
  expiresAt: Date;
  scopes: string[];
  /** FB Page id the token is scoped to. */
  pageId: string;
  /** Set only for Instagram connections. */
  igUserId?: string;
  accountName: string;
  /**
   * App-scoped id of the Meta user who authorised the connection. Stored so the
   * deauthorize and data-deletion callbacks (which arrive keyed by this id) can
   * find the right connection. Optional — a missing value just means those
   * callbacks can't auto-match this row.
   */
  authorizingUserId?: string;
}

export interface PublishResult {
  externalId: string;
  permalink: string;
}

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Normalised per-post metrics.
 *
 * Fields are optional because platforms genuinely disagree: `saves` and
 * `watchTimeAvg` are Instagram-only, `reachNonFollowers` is unavailable on
 * Facebook. Services must treat absence as "not measurable here", never as zero
 * — averaging a missing watch time as 0 would silently tank an intent score.
 */
export interface RawMetrics {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  saves?: number;
  reachNonFollowers?: number;
  watchTimeAvg?: number;
  completionRate?: number;
  profileClicks?: number;
}

export interface RawDaily {
  date: string;
  followers: number;
  reach: number;
  impressions: number;
  engagement: number;
  profileViews: number;
}

export interface InboxRaw {
  externalId: string;
  /** The platform post this comment hangs off, when the platform tells us. */
  externalPostId?: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  receivedAt: Date;
  type: "comment" | "mention";
  /** Adapters never classify sentiment — that's Claude's job in the sync engine. */
  sentiment?: Sentiment;
}

/**
 * A public-data snapshot of a competitor profile. Public metrics only — the
 * numbers anyone can see on the profile — never anything that needs the
 * competitor's own authorisation.
 */
export interface PublicProfileSnapshot {
  handle: string;
  displayName: string;
  followers: number;
  /** Posts published in the trailing 30 days, if derivable. */
  postsLast30d: number;
  /** Average engagement rate over recent posts, 0–1. */
  avgEngagementRate: number;
}

export interface ValidationResult {
  ok: boolean;
  /** Blocking problems. A non-empty list must prevent publishing. */
  errors: string[];
  /** Non-blocking advice, surfaced in the Composer. */
  warnings: string[];
}

/** Minimal asset shape an adapter needs to validate media, decoupled from Firestore. */
export interface ValidatableAsset {
  type: "image" | "video";
  format: string;
  width: number;
  height: number;
  bytes: number;
  durationSec?: number;
  url: string;
}

export interface PlatformAdapter {
  platform: Platform;

  /** `state` is an unguessable CSRF token; the callback must reject a mismatch. */
  buildAuthUrl(state: string): string;

  /** Exchange the OAuth code for a LONG-LIVED token. Short-lived tokens must never be stored. */
  exchangeCode(code: string): Promise<TokenSet>;

  refreshToken(conn: Connection, accessToken: string): Promise<TokenSet>;

  publish(conn: Connection, accessToken: string, variant: PostVariant): Promise<PublishResult>;

  fetchPostInsights(conn: Connection, accessToken: string, externalId: string): Promise<RawMetrics>;

  fetchAccountInsights(
    conn: Connection,
    accessToken: string,
    range: DateRange,
  ): Promise<RawDaily[]>;

  fetchComments(conn: Connection, accessToken: string, since: Date): Promise<InboxRaw[]>;

  /**
   * Public snapshot of another account by handle, using the connected account's
   * token to query (e.g. IG Business Discovery). Returns null when the platform
   * can't surface public data for that handle. Public data only.
   */
  fetchPublicProfile(
    conn: Connection,
    accessToken: string,
    handle: string,
  ): Promise<PublicProfileSnapshot | null>;

  replyToComment(
    conn: Connection,
    accessToken: string,
    externalCommentId: string,
    message: string,
  ): Promise<void>;

  /** Pure and synchronous — the Composer calls it on every keystroke-ish change. */
  validateMedia(asset: ValidatableAsset): ValidationResult;

  /** Platform caption limit, for the Composer's character counter. */
  captionLimit: number;
}
