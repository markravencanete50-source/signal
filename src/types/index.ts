/**
 * Signal domain types.
 *
 * These mirror the Firestore data model exactly. Firestore is schemaless, so
 * these types are the only schema there is — keep them honest.
 */

// ---------------------------------------------------------------------------
// platform
// ---------------------------------------------------------------------------

/**
 * Storage-level platform key, used on connections, metrics and adapters.
 *
 * Note the deliberate asymmetry: post *variants* are keyed `facebook` /
 * `instagram` (see `PostVariants`), while everything else uses `fb` / `ig`.
 * That's the data model as specified. Use `VARIANT_KEY` to cross between them
 * rather than hand-writing the mapping at each call site.
 */
export type Platform = "fb" | "ig";

export type VariantKey = "facebook" | "instagram";

export const VARIANT_KEY: Record<Platform, VariantKey> = {
  fb: "facebook",
  ig: "instagram",
};

export const PLATFORM_KEY: Record<VariantKey, Platform> = {
  facebook: "fb",
  instagram: "ig",
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  fb: "Facebook",
  ig: "Instagram",
};

// ---------------------------------------------------------------------------
// tenancy
// ---------------------------------------------------------------------------

/** Ordered most- to least-privileged. `client` is read-only + approvals. */
export type Role = "owner" | "admin" | "editor" | "client";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  client: "Client",
};

/** Roles permitted to create or modify content. Mirrors `canWrite()` in firestore.rules. */
export const WRITER_ROLES: readonly Role[] = ["owner", "admin", "editor"];

/** Roles permitted to manage members and brands. Mirrors `canAdmin()` in firestore.rules. */
export const ADMIN_ROLES: readonly Role[] = ["owner", "admin"];

export interface User {
  uid: string;
  email: string;
  name: string;
  avatarUrl?: string;
  defaultWorkspaceId?: string;
  createdAt: string;
}

export interface WorkspaceSettings {
  /** Monthly Claude call budget. Enforced in services/ai. */
  aiQuota: number;
  /**
   * Intent score weights. Configurable per workspace because what counts as
   * "intent" differs by vertical — lettings cares about saves, retail about
   * profile clicks. Must sum to 1.
   */
  intentWeights: {
    saveRate: number;
    shareRate: number;
    watchCompletion: number;
    profileClickRate: number;
  };
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  aiQuota: 1000,
  intentWeights: {
    saveRate: 0.3,
    shareRate: 0.3,
    watchCompletion: 0.25,
    profileClickRate: 0.15,
  },
};

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  plan: "free" | "pro";
  settings: WorkspaceSettings;
  createdAt: string;
}

export interface Member {
  uid: string;
  role: Role;
  joinedAt: string;
}

export interface Pillar {
  name: string;
  color: string;
  targetPct: number;
}

export interface Brand {
  id: string;
  workspaceId: string;
  name: string;
  logoUrl?: string;
  /** IANA zone. Every schedule and "best time" calculation resolves against this. */
  timezone: string;
  color: string;
  pillars: Pillar[];
}

// ---------------------------------------------------------------------------
// connections
// ---------------------------------------------------------------------------

export type ConnectionStatus = "active" | "expired" | "error";

/**
 * A connected FB Page / IG Business account.
 *
 * `accessTokenEnc` is AES-256-GCM ciphertext and must NEVER be sent to a client.
 * Use `PublicConnection` for anything that crosses to the browser.
 */
export interface Connection {
  id: string;
  brandId: string;
  workspaceId: string;
  platform: Platform;
  /** FB Page id. Present for both platforms — IG publishing is Page-scoped. */
  pageId: string;
  /** IG Business user id. Only set when platform === "ig". */
  igUserId?: string;
  accessTokenEnc: string;
  tokenExpiresAt: string;
  scopes: string[];
  status: ConnectionStatus;
  lastSyncAt?: string;
  lastError?: string;
  /** Display-only; the account name shown on the health card. */
  accountName: string;
  connectedByName?: string;
}

/**
 * The only shape of a connection allowed to reach the browser.
 *
 * Deliberately constructed by omission in `toPublicConnection()` rather than by
 * spreading and deleting — a future field added to `Connection` should not
 * silently become public.
 */
export interface PublicConnection {
  id: string;
  brandId: string;
  platform: Platform;
  accountName: string;
  status: ConnectionStatus;
  tokenExpiresAt: string;
  lastSyncAt?: string;
  lastError?: string;
  connectedByName?: string;
  /** Derived server-side so the UI never does token maths. */
  daysUntilExpiry: number;
}

// ---------------------------------------------------------------------------
// posts
// ---------------------------------------------------------------------------

export type PostStatus =
  "draft" | "pending_approval" | "approved" | "scheduled" | "publishing" | "published" | "failed";

export interface PostVariant {
  caption: string;
  mediaAssetIds: string[];
  firstComment?: string;
  link?: string;
  coverAssetId?: string;
}

export interface PostVariants {
  facebook?: PostVariant;
  instagram?: PostVariant;
}

export interface PublishResultEntry {
  externalId?: string;
  permalink?: string;
  error?: string;
}

export interface Post {
  id: string;
  brandId: string;
  workspaceId: string;
  createdBy: string;
  status: PostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  attempts: number;
  pillar?: string;
  variants: PostVariants;
  approval?: {
    required: boolean;
    requestedFrom?: string;
    approvalToken?: string;
    decidedBy?: string;
    decidedAt?: string;
    note?: string;
  };
  results?: Partial<Record<VariantKey, PublishResultEntry>>;
  aiMeta?: {
    suggested: boolean;
    predictedScore?: number;
    reasoning?: string;
  };
}

// ---------------------------------------------------------------------------
// misc
// ---------------------------------------------------------------------------

export type Sentiment = "positive" | "neutral" | "negative" | "lead";

export interface Notification {
  id: string;
  userId: string;
  workspaceId: string;
  title: string;
  body: string;
  href?: string;
  createdAt: string;
  readAt?: string;
}

/** A member row joined with its user profile, for the Settings → Team list. */
export interface TeamMember {
  uid: string;
  role: Role;
  joinedAt: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

// ---------------------------------------------------------------------------
// reports
// ---------------------------------------------------------------------------

export type ReportPeriod = "last-7-days" | "last-30-days" | "this-month" | "last-month";

/** A single brand's aggregated numbers for the report window. */
export interface ReportBrandSnapshot {
  brandId: string;
  brandName: string;
  followers: number | null;
  reach: number | null;
  reachDeltaPct: number | null;
  avgIntent: number | null;
  topPosts: Array<{
    title: string;
    format: string;
    platform: string;
    intentScore: number;
    reach: number;
    saves?: number;
    shares: number;
  }>;
  /**
   * Clicks driven by this brand's posts through its SmartLink, attributed back to
   * the post via the `ref` param. Empty until SmartLink attribution lands.
   */
  smartlinkClicks: Array<{ postTitle: string; clicks: number }>;
}

/**
 * A recommendation ALWAYS carries its reasoning — a bare "post more Reels" is
 * banned by the architecture rules. `text` is the action; `reason` is the
 * evidence from the snapshot that justifies it.
 */
export interface ReportRecommendation {
  text: string;
  reason: string;
}

/** The AI narrative, generated fresh from the snapshot and stored with it. */
export interface ReportNarrative {
  summary: string;
  recommendations: ReportRecommendation[];
}

/** A weekly emailed digest of a report, sent to a client without a login. */
export interface ReportDigest {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday. Matched against the cron's run day. */
  weekday: number;
  recipientEmail: string;
  lastSentAt?: string;
}

// ---------------------------------------------------------------------------
// smartlink
// ---------------------------------------------------------------------------

/** One link row on a SmartLink page. `clicks` is a running aggregate. */
export interface SmartLinkItem {
  id: string;
  label: string;
  url: string;
  /** Highlighted (accent) call-to-action button. */
  hot: boolean;
  clicks: number;
}

/**
 * A brand's link-in-bio page, one per brand, addressed by `slug` at `/s/{slug}`.
 * Public and unauthenticated — resolved server-side by slug via the Admin SDK.
 */
export interface SmartLink {
  id: string;
  workspaceId: string;
  brandId: string;
  slug: string;
  title: string;
  subtitle: string;
  /** Two-letter avatar initials shown on the public page. */
  avatarText: string;
  /** Accent hex for the hot button — the one place a SmartLink stores a colour. */
  accent: string;
  links: SmartLinkItem[];
  totalClicks: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-post click attribution aggregate, one doc per post that has driven any
 * SmartLink click (via the `?ref={postId}` param). An aggregate, not raw events
 * (architecture rule #5) — reports read these to show which content produced
 * clicks, not just reach.
 */
export interface SmartLinkAttribution {
  postId: string;
  brandId: string;
  workspaceId: string;
  postTitle: string;
  clicks: number;
  lastClickAt: string;
}

/**
 * A white-label report. Aggregates are computed and STORED at generation time
 * (never re-fetched from the Graph API on view — DECISIONS #005), so the public
 * page renders from this document alone.
 */
export interface Report {
  id: string;
  workspaceId: string;
  title: string;
  period: ReportPeriod;
  /** Resolved window the snapshot covers, for display and re-generation. */
  from: string;
  to: string;
  brandIds: string[];
  snapshot: ReportBrandSnapshot[];
  narrative: ReportNarrative | null;
  /** Public bearer token for `/r/{token}`. */
  publicToken: string;
  createdBy: string;
  createdAt: string;
  refreshedAt: string;
  viewCount: number;
  digest?: ReportDigest;
}
