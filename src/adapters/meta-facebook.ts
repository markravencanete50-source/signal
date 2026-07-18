import "server-only";

import { env } from "@/lib/env";
import type { Connection, PostVariant } from "@/types";

import { validateForPlatform } from "./mock";
import { exchangeForLongLivedToken, graphFetch, META_SCOPES, redirectUri } from "./meta-client";
import type {
  DateRange,
  InboxRaw,
  PlatformAdapter,
  PublicProfileSnapshot,
  PublishResult,
  RawDaily,
  RawMetrics,
  TokenSet,
  ValidatableAsset,
  ValidationResult,
} from "./types";

/**
 * Facebook Pages adapter.
 *
 * Token model worth understanding: OAuth yields a *user* token. Publishing to a
 * Page requires a *Page* token, fetched from `/me/accounts` using the
 * long-lived user token. Page tokens derived this way don't expire on their own
 * — but they die the moment the user's password changes or permissions are
 * revoked, which is why the token cron re-validates rather than trusting them.
 */

interface FbAccount {
  id: string;
  name: string;
  access_token: string;
}

interface FbInsightValue {
  value: number;
  end_time?: string;
}

interface FbInsight {
  name: string;
  values: FbInsightValue[];
}

/** Pull a single metric out of Graph's uniquely awkward insights envelope. */
function insightValue(data: FbInsight[], name: string): number {
  const row = data.find((d) => d.name === name);
  return row?.values[0]?.value ?? 0;
}

export const facebookAdapter: PlatformAdapter = {
  platform: "fb",
  captionLimit: 63206,

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env().META_APP_ID,
      redirect_uri: redirectUri(),
      state,
      scope: META_SCOPES.join(","),
      response_type: "code",
    });
    // Facebook Login *for Business* — the only flow App Review accepts for
    // Page management. The plain consumer login endpoint gets rejected.
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<TokenSet> {
    const { META_APP_ID, META_APP_SECRET } = env();

    const shortLived = await graphFetch<{ access_token: string }>("/oauth/access_token", {
      // The code exchange is the one call with no token yet; the app secret
      // authenticates it instead.
      accessToken: "",
      params: {
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri: redirectUri(),
        code,
      },
    });

    const longLived = await exchangeForLongLivedToken(shortLived.access_token);

    const [accounts, me] = await Promise.all([
      graphFetch<{ data: FbAccount[] }>("/me/accounts", {
        accessToken: longLived.accessToken,
        params: { fields: "id,name,access_token" },
      }),
      // The authorising user's app-scoped id, for the compliance callbacks.
      graphFetch<{ id: string }>("/me", {
        accessToken: longLived.accessToken,
        params: { fields: "id" },
      }).catch(() => null),
    ]);

    const page = accounts.data[0];
    if (!page) {
      throw new Error(
        "No Facebook Page found on this account. Signal publishes to Pages — a personal profile can't be connected.",
      );
    }

    return {
      // Store the PAGE token, not the user token: it's what publishing needs.
      accessToken: page.access_token,
      expiresAt: longLived.expiresAt,
      scopes: [...META_SCOPES],
      pageId: page.id,
      accountName: page.name,
      authorizingUserId: me?.id,
    };
  },

  async refreshToken(conn: Connection, accessToken: string): Promise<TokenSet> {
    // Page tokens can't be "refreshed" — re-derive from the user token instead.
    const longLived = await exchangeForLongLivedToken(accessToken);
    const accounts = await graphFetch<{ data: FbAccount[] }>("/me/accounts", {
      accessToken: longLived.accessToken,
      params: { fields: "id,name,access_token" },
    });

    const page = accounts.data.find((a) => a.id === conn.pageId) ?? accounts.data[0];
    if (!page) throw new Error("Page is no longer accessible with this token.");

    return {
      accessToken: page.access_token,
      expiresAt: longLived.expiresAt,
      scopes: conn.scopes,
      pageId: page.id,
      accountName: page.name,
    };
  },

  async publish(
    conn: Connection,
    accessToken: string,
    variant: PostVariant,
  ): Promise<PublishResult> {
    const hasMedia = variant.mediaAssetIds.length > 0;

    // Endpoint depends on payload: /photos for a single image, /feed for text
    // or link posts. Posting a photo to /feed silently drops the image.
    const path = hasMedia ? `/${conn.pageId}/photos` : `/${conn.pageId}/feed`;

    const params: Record<string, string | undefined> = hasMedia
      ? { caption: variant.caption, url: variant.mediaAssetIds[0] }
      : { message: variant.caption, link: variant.link };

    const res = await graphFetch<{ id: string; post_id?: string }>(path, {
      accessToken,
      method: "POST",
      params,
    });

    // /photos returns the photo id in `id` and the feed story in `post_id`.
    // The permalink must use post_id or it 404s for the user.
    const externalId = res.post_id ?? res.id;

    if (variant.firstComment) {
      // Best-effort: a failed first comment must not fail an otherwise
      // successful publish, or the retry would double-post.
      try {
        await graphFetch(`/${externalId}/comments`, {
          accessToken,
          method: "POST",
          params: { message: variant.firstComment },
        });
      } catch {
        // Swallowed deliberately — surfaced via metrics, not a publish failure.
      }
    }

    return {
      externalId,
      permalink: `https://www.facebook.com/${externalId}`,
    };
  },

  async updateCaption(
    _conn: Connection,
    accessToken: string,
    externalId: string,
    caption: string,
  ): Promise<void> {
    // Facebook allows editing a Page post's message in place. The returned
    // `success` flag is Graph's own confirmation; a failure surfaces as a
    // GraphError from graphFetch.
    await graphFetch(`/${externalId}`, {
      accessToken,
      method: "POST",
      params: { message: caption },
    });
  },

  async fetchPostInsights(
    _conn: Connection,
    accessToken: string,
    externalId: string,
  ): Promise<RawMetrics> {
    const [insights, engagement] = await Promise.all([
      graphFetch<{ data: FbInsight[] }>(`/${externalId}/insights`, {
        accessToken,
        // post_impressions_unique was deprecated for all Graph versions on
        // 2026-06-15 (Meta's Nov-2025-announced impressions→media-view
        // shift); post_total_media_view_unique is the documented replacement.
        params: { metric: "post_total_media_view_unique,post_clicks" },
      }),
      graphFetch<{
        likes?: { summary?: { total_count: number } };
        comments?: { summary?: { total_count: number } };
        shares?: { count: number };
      }>(`/${externalId}`, {
        accessToken,
        params: { fields: "likes.summary(true),comments.summary(true),shares" },
      }),
    ]);

    return {
      likes: engagement.likes?.summary?.total_count ?? 0,
      comments: engagement.comments?.summary?.total_count ?? 0,
      shares: engagement.shares?.count ?? 0,
      reach: insightValue(insights.data, "post_total_media_view_unique"),
      // saves / watchTimeAvg / reachNonFollowers intentionally omitted: Facebook
      // does not report them. Undefined means "not measurable", not zero.
    };
  },

  async fetchAccountInsights(
    conn: Connection,
    accessToken: string,
    range: DateRange,
  ): Promise<RawDaily[]> {
    const res = await graphFetch<{ data: FbInsight[] }>(`/${conn.pageId}/insights`, {
      accessToken,
      params: {
        // Verified live against the real Graph API (v25.0) on 2026-07-18 —
        // Meta's own docs undersold how much this deprecation wave touched:
        //   - page_impressions_unique -> page_total_media_view_unique (both
        //     confirmed valid/invalid respectively via a live test call).
        //     Meta narrowed "impression" (delivered to feed) to "media view"
        //     (visually rendered), so reach reads lower than historical data —
        //     that's the new definition, not a data problem.
        //   - page_impressions (non-unique) has NO replacement — Meta retired
        //     the concept at the page level entirely in the same views-only
        //     push. impressions is left at 0 below; that means "no longer
        //     measurable", not "zero impressions".
        //   - page_fans -> page_follows (also silently broken; not mentioned
        //     in any doc/changelog found, only caught by testing metrics one
        //     at a time against a real token).
        metric: "page_total_media_view_unique,page_post_engagements,page_views_total,page_follows",
        period: "day",
        since: Math.floor(range.from.getTime() / 1000).toString(),
        until: Math.floor(range.to.getTime() / 1000).toString(),
      },
    });

    // Graph returns one row per metric, each with a values[] time series —
    // transposed from the per-day shape we store. Pivot on end_time.
    const byDate = new Map<string, RawDaily>();

    const put = (metric: string, apply: (d: RawDaily, v: number) => void) => {
      const row = res.data.find((r) => r.name === metric);
      for (const v of row?.values ?? []) {
        if (!v.end_time) continue;
        const date = v.end_time.slice(0, 10);
        const existing = byDate.get(date) ?? {
          date,
          followers: 0,
          reach: 0,
          impressions: 0,
          engagement: 0,
          profileViews: 0,
        };
        apply(existing, v.value);
        byDate.set(date, existing);
      }
    };

    put("page_total_media_view_unique", (d, v) => (d.reach = v));
    put("page_post_engagements", (d, v) => (d.engagement = v));
    put("page_views_total", (d, v) => (d.profileViews = v));
    put("page_follows", (d, v) => (d.followers = v));
    // impressions has no surviving metric — left at the byDate default (0).

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  },

  async fetchComments(conn: Connection, accessToken: string, since: Date): Promise<InboxRaw[]> {
    const res = await graphFetch<{
      data: Array<{
        id: string;
        message?: string;
        created_time: string;
        from?: { name?: string; id: string };
      }>;
    }>(`/${conn.pageId}/feed`, {
      accessToken,
      params: {
        fields: "comments{id,message,created_time,from}",
        since: Math.floor(since.getTime() / 1000).toString(),
      },
    });

    const out: InboxRaw[] = [];
    for (const post of res.data) {
      const comments = (post as unknown as { comments?: { data?: Array<Record<string, unknown>> } })
        .comments;
      for (const c of comments?.data ?? []) {
        const id = c.id as string | undefined;
        const message = c.text ?? (c.message as string | undefined);
        if (!id || !message) continue;

        out.push({
          externalId: id,
          externalPostId: post.id,
          authorName: (c.from as { name?: string } | undefined)?.name ?? "Facebook user",
          text: String(message),
          receivedAt: new Date(String(c.created_time)),
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
    await graphFetch(`/${externalCommentId}/comments`, {
      accessToken,
      method: "POST",
      params: { message },
    });
  },

  /**
   * Facebook has no public equivalent of IG Business Discovery — a Page's
   * follower/engagement data isn't readable for accounts we don't manage — so
   * competitor tracking is Instagram-only. Returning null (rather than throwing)
   * lets the competitors engine simply skip FB-platform competitors.
   */
  async fetchPublicProfile(): Promise<PublicProfileSnapshot | null> {
    return null;
  },

  validateMedia(asset: ValidatableAsset): ValidationResult {
    return validateForPlatform("fb", asset);
  },
};
