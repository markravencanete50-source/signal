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

/**
 * Live token status from the platform (Meta's `/debug_token`).
 *
 * Timestamps are ms since epoch, or null for "never expires" / unknown — Meta
 * reports a non-expiring token as 0, which this normalises to null so callers
 * treat it as "no deadline" rather than "expired in 1970".
 */
export interface TokenHealth {
  /** Whether the token is currently usable at all. */
  isValid: boolean;
  /** When the access token itself expires (refreshable), or null. */
  expiresAt: number | null;
  /** When the user's data-access grant expires — NOT refreshable, needs reconnect. */
  dataAccessExpiresAt: number | null;
  /** Scopes currently attached to the token, for drift detection. */
  scopes: string[];
  /** Platform's reason when `isValid` is false. */
  error?: string;
}

/**
 * Result of re-checking whether a just-published post still exists on the
 * platform. `transient: true` means we couldn't determine existence (rate
 * limit, 5xx, dead token) — the caller should retry rather than declare the
 * post missing and alarm the user.
 */
export interface VerifyOutcome {
  exists: boolean;
  transient: boolean;
  /** Platform's note, useful when a post is genuinely missing. */
  detail?: string;
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

  /**
   * Live token status for the health monitor. Must resolve `isValid: false`
   * (rather than throw) for a dead token, so the caller can react; a transient
   * failure (network, rate limit) should still throw so it's retried, not
   * mistaken for a revoked token.
   */
  checkTokenHealth(conn: Connection, accessToken: string): Promise<TokenHealth>;

  publish(conn: Connection, accessToken: string, variant: PostVariant): Promise<PublishResult>;

  /**
   * Confirm a previously-published post still exists on the platform, by id.
   * Used by the verify-after-publish pass to catch a "success" that silently
   * never appeared. Must resolve `transient: true` (not throw) when it simply
   * can't reach the platform, so a network blip isn't mistaken for a vanished
   * post.
   */
  verifyPublished(
    conn: Connection,
    accessToken: string,
    externalId: string,
  ): Promise<VerifyOutcome>;

  /**
   * Edit the caption of an already-published post, where the platform allows
   * it. Optional: Facebook Pages support message edits via the Graph API;
   * Instagram has no caption-edit endpoint, so its adapter omits this and the
   * UI disables the affordance.
   */
  updateCaption?(
    conn: Connection,
    accessToken: string,
    externalId: string,
    caption: string,
  ): Promise<void>;

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
