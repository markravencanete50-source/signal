import type { Connection, Platform, PostVariant } from "@/types";

import type {
  DateRange,
  InboxRaw,
  PlatformAdapter,
  PublicProfileSnapshot,
  PublishResult,
  RawDaily,
  RawMetrics,
  TokenHealth,
  TokenSet,
  ValidatableAsset,
  ValidationResult,
} from "./types";

/**
 * MockAdapter — a full stand-in for the Graph API, toggled by USE_MOCK_ADAPTERS.
 *
 * The point is that every engine (publish, sync, anomaly detection, AI) runs
 * *identically* against this, so the product is demoable before Meta App Review
 * clears and testable in CI without network or credentials.
 *
 * Two properties make it useful rather than a toy:
 *
 * 1. **Deterministic.** Values are derived from a hash of the entity id, not
 *    Math.random(). A brand's metrics must not jitter between refreshes, or
 *    anomaly detection would fire on its own noise and "top posts" would
 *    reshuffle on every render.
 * 2. **Realistic shape.** Reach follows a weekly rhythm with a slow growth
 *    trend, IG-only fields stay undefined on Facebook, and latency is non-zero
 *    so loading states actually get exercised.
 */

// ---------------------------------------------------------------------------
// deterministic pseudo-randomness
// ---------------------------------------------------------------------------

/** FNV-1a. Small, fast, and stable across processes — unlike hashing via Math.random seeds. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable float in [0,1) for a given key. */
function rand(key: string): number {
  return hash(key) / 0x100000000;
}

/** Stable integer in [min,max]. */
function randInt(key: string, min: number, max: number): number {
  return Math.floor(rand(key) * (max - min + 1)) + min;
}

/** Simulated network latency, so loading and skeleton states are real. */
function latency(key: string, min = 120, max = 480): Promise<void> {
  return new Promise((r) => setTimeout(r, randInt(key, min, max)));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// adapter
// ---------------------------------------------------------------------------

const IG_CAPTION_LIMIT = 2200;
const FB_CAPTION_LIMIT = 63206;

export function createMockAdapter(platform: Platform): PlatformAdapter {
  const isIg = platform === "ig";

  return {
    platform,
    captionLimit: isIg ? IG_CAPTION_LIMIT : FB_CAPTION_LIMIT,

    buildAuthUrl(state: string): string {
      // Loops straight back to the real callback so the OAuth round-trip —
      // including state verification and encrypted token storage — is exercised
      // end to end without Meta being involved.
      const params = new URLSearchParams({
        code: `mock_code_${platform}_${state.slice(0, 8)}`,
        state,
      });
      return `/api/auth/meta/callback?${params.toString()}`;
    },

    async exchangeCode(code: string): Promise<TokenSet> {
      await latency(code);
      const expiresAt = new Date();
      // Mirrors the real thing: long-lived Meta tokens last 60 days.
      expiresAt.setDate(expiresAt.getDate() + 60);

      return {
        accessToken: `mock_long_lived_token_${platform}_${hash(code).toString(16)}`,
        expiresAt,
        scopes: isIg
          ? [
              "instagram_basic",
              "instagram_content_publish",
              "instagram_manage_insights",
              "instagram_manage_comments",
            ]
          : ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
        pageId: `mock_page_${hash(code) % 100000}`,
        igUserId: isIg ? `mock_ig_${hash(code) % 100000}` : undefined,
        accountName: isIg ? "@houseoflettings" : "House of Lettings",
        authorizingUserId: `mock_user_${hash(code) % 100000}`,
      };
    },

    async refreshToken(conn: Connection): Promise<TokenSet> {
      await latency(conn.id);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      return {
        accessToken: `mock_refreshed_${platform}_${Date.now()}`,
        expiresAt,
        scopes: conn.scopes,
        pageId: conn.pageId,
        igUserId: conn.igUserId,
        accountName: conn.accountName,
      };
    },

    async checkTokenHealth(conn: Connection): Promise<TokenHealth> {
      await latency(conn.id);
      // Mirror the stored expiry so the health monitor + UI behave realistically
      // in mock mode: valid while the stored token is in the future, with a
      // synthetic 90-day data-access window on top.
      const tokenMs = new Date(conn.tokenExpiresAt).getTime();
      return {
        isValid: tokenMs > Date.now(),
        expiresAt: tokenMs,
        dataAccessExpiresAt: tokenMs + 30 * 86_400_000,
        scopes: conn.scopes ?? [],
        error: tokenMs > Date.now() ? undefined : "Mock token expired.",
      };
    },

    async publish(
      conn: Connection,
      _accessToken: string,
      variant: PostVariant,
    ): Promise<PublishResult> {
      // IG's real publish is create-container → poll → publish, so it is
      // genuinely slower. Keeping that shape here means timeouts and the
      // publishing→published transition get exercised honestly.
      await latency(variant.caption, isIg ? 600 : 200, isIg ? 1400 : 600);

      const key = `${conn.id}:${variant.caption}`;

      // ~4% simulated failure, deterministic per post. The publish engine's
      // retry/backoff path is otherwise dead code no one ever sees run.
      if (rand(`fail:${key}`) < 0.04) {
        throw new Error(
          isIg
            ? "Media container failed to process (mock). The video may be an unsupported codec."
            : "Page publish rejected (mock): temporary Graph API error, retry.",
        );
      }

      const externalId = `${platform}_${hash(key).toString(16)}`;
      return {
        externalId,
        permalink: isIg
          ? `https://instagram.com/p/${externalId}`
          : `https://facebook.com/${conn.pageId}/posts/${externalId}`,
      };
    },

    // Mirror the real adapters: FB supports editing a published caption, IG
    // doesn't — so the mock only exposes it for FB, keeping the UI honest.
    ...(isIg
      ? {}
      : {
          async updateCaption(): Promise<void> {
            await latency("update-caption", 150, 400);
          },
        }),

    async fetchPostInsights(
      conn: Connection,
      _accessToken: string,
      externalId: string,
    ): Promise<RawMetrics> {
      await latency(externalId);
      const k = `${conn.id}:${externalId}`;

      const reach = randInt(`reach:${k}`, 800, 9000);
      const likes = Math.floor(reach * (0.02 + rand(`like:${k}`) * 0.05));
      const comments = Math.floor(likes * (0.05 + rand(`cmt:${k}`) * 0.15));
      const shares = Math.floor(likes * (0.1 + rand(`shr:${k}`) * 0.4));

      const base: RawMetrics = { likes, comments, shares, reach };

      if (!isIg) {
        // Facebook genuinely does not report saves, watch completion or
        // non-follower reach. Leaving these undefined (not 0) is the whole
        // reason RawMetrics has optional fields.
        return base;
      }

      return {
        ...base,
        saves: Math.floor(likes * (0.2 + rand(`sav:${k}`) * 0.9)),
        reachNonFollowers: Math.floor(reach * (0.35 + rand(`nf:${k}`) * 0.35)),
        watchTimeAvg: 8 + rand(`wt:${k}`) * 22,
        completionRate: 0.35 + rand(`cr:${k}`) * 0.45,
        profileClicks: Math.floor(reach * (0.005 + rand(`pc:${k}`) * 0.02)),
      };
    },

    async fetchAccountInsights(
      conn: Connection,
      _accessToken: string,
      range: DateRange,
    ): Promise<RawDaily[]> {
      await latency(conn.id);

      const days: RawDaily[] = [];
      const cursor = new Date(range.from);
      let followers = randInt(`fol:${conn.id}`, 4000, 16000);

      while (cursor <= range.to) {
        const k = `${conn.id}:${iso(cursor)}`;

        // Weekend dip + slow upward trend — enough structure that best-time
        // bucketing and 7-day-average anomaly detection have real signal.
        const dow = cursor.getDay();
        const weekend = dow === 0 || dow === 6 ? 0.75 : 1;
        const noise = 0.85 + rand(`n:${k}`) * 0.3;

        const reach = Math.floor(randInt(`r:${conn.id}`, 1200, 4200) * weekend * noise);
        followers += randInt(`g:${k}`, -3, 14);

        days.push({
          date: iso(cursor),
          followers,
          reach,
          impressions: Math.floor(reach * (1.2 + rand(`i:${k}`) * 0.6)),
          engagement: Math.floor(reach * (0.03 + rand(`e:${k}`) * 0.05)),
          profileViews: Math.floor(reach * (0.01 + rand(`p:${k}`) * 0.03)),
        });

        cursor.setDate(cursor.getDate() + 1);
      }

      return days;
    },

    async fetchComments(conn: Connection, _accessToken: string, since: Date): Promise<InboxRaw[]> {
      await latency(conn.id);

      const samples = [
        {
          text: "Is the Headingley 2-bed still available? Would love a viewing this weekend if so 🙏",
          author: "Sarah K.",
        },
        {
          text: "Still waiting on my deposit return from March. Third time asking here — can someone actually respond?",
          author: "Tom B.",
        },
        {
          text: "Great refurb video — which contractor did you use for the kitchen?",
          author: "James M.",
        },
        {
          text: "Mentioned you in a landlords group — your fee breakdown post was the clearest I've seen.",
          author: "Dan R.",
        },
        {
          text: "What's the going rate for a 3-bed in Chapel Allerton these days?",
          author: "Priya N.",
        },
      ];

      const count = randInt(`cc:${conn.id}:${iso(since)}`, 0, samples.length);

      return samples.slice(0, count).map((s, i) => {
        const receivedAt = new Date(since.getTime() + (i + 1) * 37 * 60 * 1000);
        return {
          externalId: `${platform}_cmt_${hash(`${conn.id}:${s.author}:${iso(since)}`).toString(16)}`,
          authorName: s.author,
          text: s.text,
          receivedAt,
          type: "comment" as const,
          // No sentiment: classification is Claude's job in the sync engine,
          // and pre-filling it here would let a bug in that path go unnoticed.
        };
      });
    },

    async replyToComment(
      conn: Connection,
      _accessToken: string,
      externalCommentId: string,
    ): Promise<void> {
      await latency(externalCommentId);
      if (rand(`reply:${externalCommentId}`) < 0.02) {
        throw new Error("Comment no longer exists (mock) — it may have been deleted.");
      }
    },

    async fetchPublicProfile(
      _conn: Connection,
      _accessToken: string,
      handle: string,
    ): Promise<PublicProfileSnapshot | null> {
      await latency(`profile:${handle}`);
      const key = `${platform}:${handle.toLowerCase()}`;
      return {
        handle,
        displayName: handle.replace(/^@/, "").replace(/[._]/g, " "),
        followers: randInt(`${key}:followers`, 3_000, 40_000),
        postsLast30d: randInt(`${key}:posts`, 4, 30),
        // 1%–9% engagement, stable per handle.
        avgEngagementRate: randInt(`${key}:eng`, 10, 90) / 1000,
      };
    },

    validateMedia(asset: ValidatableAsset): ValidationResult {
      return validateForPlatform(platform, asset);
    },
  };
}

/**
 * Media validation, shared by the mock and real adapters.
 *
 * Deliberately lives outside the adapter objects: these are platform *rules*,
 * not platform *calls*, so mock and live must agree exactly. If they diverged,
 * a post that validates in a demo would fail in production.
 */
export function validateForPlatform(platform: Platform, asset: ValidatableAsset): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ratio = asset.width / asset.height;

  if (platform === "ig") {
    if (asset.type === "image") {
      // IG rejects outside 4:5 → 1.91:1.
      if (ratio < 0.8)
        errors.push("Image is taller than Instagram's 4:5 limit — it will be cropped or rejected.");
      if (ratio > 1.91) errors.push("Image is wider than Instagram's 1.91:1 limit.");
      if (asset.bytes > 8 * 1024 * 1024) errors.push("Instagram images must be under 8MB.");
      if (asset.width < 320) errors.push("Instagram images must be at least 320px wide.");
    } else {
      const dur = asset.durationSec ?? 0;
      if (dur > 90) errors.push("Reels must be 90 seconds or shorter.");
      if (dur < 3) errors.push("Reels must be at least 3 seconds.");
      if (asset.bytes > 1024 * 1024 * 1024) errors.push("Reels must be under 1GB.");
      if (Math.abs(ratio - 9 / 16) > 0.05) {
        warnings.push("Reels perform best at 9:16 — this will be letterboxed or cropped.");
      }
    }
  } else {
    if (asset.type === "video") {
      const dur = asset.durationSec ?? 0;
      if (dur > 240 * 60) errors.push("Facebook videos must be under 240 minutes.");
      if (asset.bytes > 4 * 1024 * 1024 * 1024) errors.push("Facebook videos must be under 4GB.");
    } else if (asset.bytes > 30 * 1024 * 1024) {
      errors.push("Facebook images must be under 30MB.");
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
