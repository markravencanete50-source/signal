import "server-only";

import { env } from "@/lib/env";
import type { Connection, PostVariant } from "@/types";

import { validateForPlatform } from "./mock";
import { exchangeForLongLivedToken, graphFetch, META_SCOPES, redirectUri } from "./meta-client";
import type {
  DateRange,
  InboxRaw,
  PlatformAdapter,
  PublishResult,
  RawDaily,
  RawMetrics,
  TokenSet,
  ValidatableAsset,
  ValidationResult,
} from "./types";

/**
 * Instagram Business adapter.
 *
 * Three things that catch people out and shape this file:
 *
 * 1. **There is no Instagram login.** An IG Business account is reached through
 *    the Facebook Page it's linked to. OAuth is Facebook's; the IG user id is
 *    then read off the Page.
 * 2. **Publishing is two-step, not one call.** Create a media container from a
 *    PUBLICLY fetchable URL → poll until `status_code === FINISHED` → publish.
 *    Meta's servers fetch that URL themselves, so signed/expiring Cloudinary
 *    URLs fail. Video containers routinely take 10-30s.
 * 3. **25 published posts per account per 24h.** Exceeding it fails the publish
 *    call, so the limit is surfaced as a real error rather than a silent retry.
 */

interface IgInsightValue {
  value: number;
  end_time?: string;
}

interface IgInsight {
  name: string;
  values: IgInsightValue[];
}

function insightValue(data: IgInsight[], name: string): number {
  return data.find((d) => d.name === name)?.values[0]?.value ?? 0;
}

/** Container states worth polling on. */
const CONTAINER_POLL_INTERVAL_MS = 2000;
const CONTAINER_POLL_TIMEOUT_MS = 90_000;

async function waitForContainer(containerId: string, accessToken: string): Promise<void> {
  const deadline = Date.now() + CONTAINER_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const res = await graphFetch<{ status_code: string; status?: string }>(`/${containerId}`, {
      accessToken,
      params: { fields: "status_code,status" },
    });

    if (res.status_code === "FINISHED") return;

    if (res.status_code === "ERROR" || res.status_code === "EXPIRED") {
      throw new Error(
        `Instagram could not process the media (${res.status_code}). ${res.status ?? ""}`.trim() +
          " Check the media URL is publicly reachable and the codec is supported.",
      );
    }

    // IN_PROGRESS / PUBLISHED — keep waiting.
    await new Promise((r) => setTimeout(r, CONTAINER_POLL_INTERVAL_MS));
  }

  throw new Error(
    "Instagram media container timed out after 90s. Large videos can exceed this — the post will be retried.",
  );
}

export const instagramAdapter: PlatformAdapter = {
  platform: "ig",
  captionLimit: 2200,

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env().META_APP_ID,
      redirect_uri: redirectUri(),
      state,
      scope: META_SCOPES.join(","),
      response_type: "code",
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<TokenSet> {
    const { META_APP_ID, META_APP_SECRET } = env();

    const shortLived = await graphFetch<{ access_token: string }>("/oauth/access_token", {
      accessToken: "",
      params: {
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri: redirectUri(),
        code,
      },
    });

    const longLived = await exchangeForLongLivedToken(shortLived.access_token);

    // The IG account hangs off the Page, so ask for it in the same call.
    const accounts = await graphFetch<{
      data: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username?: string };
      }>;
    }>("/me/accounts", {
      accessToken: longLived.accessToken,
      params: { fields: "id,name,access_token,instagram_business_account{id,username}" },
    });

    const page = accounts.data.find((a) => a.instagram_business_account);
    if (!page?.instagram_business_account) {
      throw new Error(
        "No Instagram Business account is linked to your Facebook Page. Convert the account to Business (not Creator) and link it to the Page, then try again.",
      );
    }

    return {
      accessToken: page.access_token,
      expiresAt: longLived.expiresAt,
      scopes: [...META_SCOPES],
      pageId: page.id,
      igUserId: page.instagram_business_account.id,
      accountName: page.instagram_business_account.username
        ? `@${page.instagram_business_account.username}`
        : page.name,
    };
  },

  async refreshToken(conn: Connection, accessToken: string): Promise<TokenSet> {
    const longLived = await exchangeForLongLivedToken(accessToken);
    const accounts = await graphFetch<{
      data: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username?: string };
      }>;
    }>("/me/accounts", {
      accessToken: longLived.accessToken,
      params: { fields: "id,name,access_token,instagram_business_account{id,username}" },
    });

    const page = accounts.data.find((a) => a.id === conn.pageId);
    if (!page)
      throw new Error("Page is no longer accessible — the Instagram link may have been removed.");

    return {
      accessToken: page.access_token,
      expiresAt: longLived.expiresAt,
      scopes: conn.scopes,
      pageId: page.id,
      igUserId: page.instagram_business_account?.id ?? conn.igUserId,
      accountName: conn.accountName,
    };
  },

  async publish(
    conn: Connection,
    accessToken: string,
    variant: PostVariant,
  ): Promise<PublishResult> {
    const igUserId = conn.igUserId;
    if (!igUserId)
      throw new Error("Connection is missing its Instagram user id — reconnect the account.");

    const mediaUrls = variant.mediaAssetIds;
    if (mediaUrls.length === 0) {
      throw new Error(
        "Instagram requires at least one image or video — text-only posts aren't supported.",
      );
    }

    let containerId: string;

    if (mediaUrls.length > 1) {
      // Carousel: each child is its own container, then a parent ties them
      // together. Children must be created before the parent exists.
      const children = await Promise.all(
        mediaUrls.map(async (url) => {
          const child = await graphFetch<{ id: string }>(`/${igUserId}/media`, {
            accessToken,
            method: "POST",
            params: { image_url: url, is_carousel_item: "true" },
          });
          return child.id;
        }),
      );

      for (const child of children) await waitForContainer(child, accessToken);

      const parent = await graphFetch<{ id: string }>(`/${igUserId}/media`, {
        accessToken,
        method: "POST",
        params: {
          media_type: "CAROUSEL",
          children: children.join(","),
          caption: variant.caption,
        },
      });
      containerId = parent.id;
    } else {
      const url = mediaUrls[0] as string;
      const isVideo = /\.(mp4|mov|m4v)(\?|$)/i.test(url);

      const created = await graphFetch<{ id: string }>(`/${igUserId}/media`, {
        accessToken,
        method: "POST",
        params: isVideo
          ? {
              // REELS, not VIDEO — plain feed video is deprecated for API
              // publishing and lands with far less reach.
              media_type: "REELS",
              video_url: url,
              caption: variant.caption,
              cover_url: variant.coverAssetId,
            }
          : { image_url: url, caption: variant.caption },
      });
      containerId = created.id;
    }

    await waitForContainer(containerId, accessToken);

    const published = await graphFetch<{ id: string }>(`/${igUserId}/media_publish`, {
      accessToken,
      method: "POST",
      params: { creation_id: containerId },
    });

    const permalinkRes = await graphFetch<{ permalink?: string }>(`/${published.id}`, {
      accessToken,
      params: { fields: "permalink" },
    });

    if (variant.firstComment) {
      try {
        await graphFetch(`/${published.id}/comments`, {
          accessToken,
          method: "POST",
          params: { message: variant.firstComment },
        });
      } catch {
        // Never fail a successful publish over a first comment — a retry would double-post.
      }
    }

    return {
      externalId: published.id,
      permalink: permalinkRes.permalink ?? `https://www.instagram.com/p/${published.id}`,
    };
  },

  async fetchPostInsights(
    _conn: Connection,
    accessToken: string,
    externalId: string,
  ): Promise<RawMetrics> {
    const [insights, media] = await Promise.all([
      graphFetch<{ data: IgInsight[] }>(`/${externalId}/insights`, {
        accessToken,
        params: {
          metric:
            "reach,saved,shares,total_interactions,profile_visits,ig_reels_avg_watch_time,ig_reels_video_view_total_time",
        },
      }).catch(() => ({ data: [] as IgInsight[] })),
      graphFetch<{ like_count?: number; comments_count?: number; media_product_type?: string }>(
        `/${externalId}`,
        { accessToken, params: { fields: "like_count,comments_count,media_product_type" } },
      ),
    ]);

    const reach = insightValue(insights.data, "reach");
    const isReel = media.media_product_type === "REELS";
    // Reels-only metrics; leave undefined on stills so intent scoring can tell
    // "not applicable" from "scored zero".
    const watchTimeAvg = isReel
      ? insightValue(insights.data, "ig_reels_avg_watch_time") / 1000
      : undefined;

    return {
      likes: media.like_count ?? 0,
      comments: media.comments_count ?? 0,
      shares: insightValue(insights.data, "shares"),
      reach,
      saves: insightValue(insights.data, "saved"),
      profileClicks: insightValue(insights.data, "profile_visits"),
      watchTimeAvg,
    };
  },

  async fetchAccountInsights(
    conn: Connection,
    accessToken: string,
    range: DateRange,
  ): Promise<RawDaily[]> {
    const igUserId = conn.igUserId;
    if (!igUserId) throw new Error("Connection is missing its Instagram user id.");

    const res = await graphFetch<{ data: IgInsight[] }>(`/${igUserId}/insights`, {
      accessToken,
      params: {
        metric: "reach,impressions,profile_views",
        period: "day",
        since: Math.floor(range.from.getTime() / 1000).toString(),
        until: Math.floor(range.to.getTime() / 1000).toString(),
      },
    });

    const profile = await graphFetch<{ followers_count?: number }>(`/${igUserId}`, {
      accessToken,
      params: { fields: "followers_count" },
    });

    const byDate = new Map<string, RawDaily>();
    const put = (metric: string, apply: (d: RawDaily, v: number) => void) => {
      const row = res.data.find((r) => r.name === metric);
      for (const v of row?.values ?? []) {
        if (!v.end_time) continue;
        const date = v.end_time.slice(0, 10);
        const existing = byDate.get(date) ?? {
          date,
          // IG only exposes a *current* follower count, not a daily series, so
          // every day in this batch carries today's value. Historical follower
          // trend is built from the accumulated metricsDaily rows over time.
          followers: profile.followers_count ?? 0,
          reach: 0,
          impressions: 0,
          engagement: 0,
          profileViews: 0,
        };
        apply(existing, v.value);
        byDate.set(date, existing);
      }
    };

    put("reach", (d, v) => (d.reach = v));
    put("impressions", (d, v) => (d.impressions = v));
    put("profile_views", (d, v) => (d.profileViews = v));

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  },

  async fetchComments(conn: Connection, accessToken: string, since: Date): Promise<InboxRaw[]> {
    const igUserId = conn.igUserId;
    if (!igUserId) return [];

    const media = await graphFetch<{
      data: Array<{
        id: string;
        comments?: {
          data?: Array<{ id: string; text?: string; timestamp?: string; username?: string }>;
        };
      }>;
    }>(`/${igUserId}/media`, {
      accessToken,
      params: { fields: "id,comments{id,text,timestamp,username}", limit: "25" },
    });

    const out: InboxRaw[] = [];
    for (const post of media.data) {
      for (const c of post.comments?.data ?? []) {
        if (!c.text || !c.timestamp) continue;
        const receivedAt = new Date(c.timestamp);
        // The media edge has no `since` filter, so filter client-side rather
        // than re-ingesting the whole comment history every sync.
        if (receivedAt <= since) continue;

        out.push({
          externalId: c.id,
          externalPostId: post.id,
          authorName: c.username ? `@${c.username}` : "Instagram user",
          text: c.text,
          receivedAt,
          type: "comment",
        });
      }
    }
    return out;
  },

  async replyToComment(
    _conn: Connection,
    accessToken: string,
    externalCommentId: string,
    message: string,
  ) {
    await graphFetch(`/${externalCommentId}/replies`, {
      accessToken,
      method: "POST",
      params: { message },
    });
  },

  validateMedia(asset: ValidatableAsset): ValidationResult {
    return validateForPlatform("ig", asset);
  },
};
