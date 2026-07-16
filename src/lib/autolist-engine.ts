import "server-only";

import { generateCaption } from "./ai/caption";
import { isAiConfigured } from "./claude";
import { claimDueAutolists, replaceItem, saveAutolistProgress } from "./db/autolists";
import { getBrand } from "./db/brands";
import { getPostIntentScore } from "./db/metrics";
import { createPost } from "./db/posts";
import { pickNextItem, shouldRetire } from "@/services/autolist";
import type { Autolist, AutolistItem, Platform, PostVariants } from "@/types";

/**
 * Autolist engine — the cron-driven publisher behind evergreen queues and RSS
 * feeds. `claimDueAutolists` locks each due autolist (advancing its nextRunAt)
 * before we do the slow work here, so the whole run is idempotent and safe to
 * re-enter.
 */

export interface AutolistRunResult {
  processed: number;
  published: number;
  queued: number;
  retired: number;
  paused: number;
}

export async function runAutolists(now = new Date()): Promise<AutolistRunResult> {
  const due = await claimDueAutolists(now);
  const result: AutolistRunResult = {
    processed: 0,
    published: 0,
    queued: 0,
    retired: 0,
    paused: 0,
  };

  for (const autolist of due) {
    result.processed++;
    try {
      if (autolist.type === "evergreen") await runEvergreen(autolist, now, result);
      else await runRss(autolist, result);
    } catch {
      // One bad feed or item shouldn't sink the whole tick; nextRunAt already
      // advanced under the lock, so this autolist simply tries again next cycle.
    }
  }

  return result;
}

/**
 * Publish the next evergreen item. Before picking, refresh each item's score from
 * its last post so the auto-retire decision uses real performance; anything below
 * the threshold is retired and flagged rather than re-posted. If nothing is left
 * to publish, the autolist pauses itself.
 */
async function runEvergreen(
  autolist: Autolist,
  now: Date,
  result: AutolistRunResult,
): Promise<void> {
  const scored = await refreshScores(autolist.items);

  const pick = pickNextItem(scored, autolist.cursor, autolist.retireBelowIntent);

  // Retire any item now under threshold. Doing it from `shouldRetire` (rather
  // than only the pick's scan) means a null pick still records every retirement.
  let items = scored.map((it) =>
    !it.retired && shouldRetire(it, autolist.retireBelowIntent)
      ? {
          ...it,
          retired: true,
          retiredReason: `Scored ${it.lastIntentScore} last cycle — below the ${autolist.retireBelowIntent} threshold.`,
        }
      : it,
  );
  result.retired += items.filter((it, i) => it.retired && !scored[i]!.retired).length;

  if (!pick) {
    // Everything is retired/empty — stop looping and let the team rework it.
    await saveAutolistProgress(autolist.id, { items, enabled: false });
    result.paused++;
    return;
  }

  const postId = await createPost({
    brandId: autolist.brandId,
    workspaceId: autolist.workspaceId,
    createdBy: autolist.createdBy,
    status: "scheduled",
    scheduledAt: now.toISOString(),
    variants: buildVariants(autolist.platforms, pick.item.caption, pick.item.mediaAssetIds),
    aiMeta: { suggested: true, reasoning: `Evergreen autolist "${autolist.name}".` },
  });

  // Record which post this item produced, so next cycle can read its score.
  items = replaceItem(items, { ...pick.item, lastPostId: postId, lastIntentScore: undefined });
  result.published++;

  await saveAutolistProgress(autolist.id, { items, cursor: pick.nextCursor });
}

/** Read each item's last-post intent score so retire decisions use fresh data. */
async function refreshScores(items: AutolistItem[]): Promise<AutolistItem[]> {
  return Promise.all(
    items.map(async (it) => {
      if (it.retired || !it.lastPostId) return it;
      const score = await getPostIntentScore(it.lastPostId);
      return score === null ? it : { ...it, lastIntentScore: score };
    }),
  );
}

/**
 * Pull new entries from the RSS feed and queue them as drafts, one per platform
 * with a Claude-rewritten caption. Drafts (not auto-published) so the team keeps
 * editorial control over third-party content. Deduped by link.
 */
async function runRss(autolist: Autolist, result: AutolistRunResult): Promise<void> {
  if (!autolist.rssUrl) return;

  const entries = await fetchFeed(autolist.rssUrl);
  const seen = new Set(autolist.seenLinks ?? []);
  const fresh = entries.filter((e) => e.link && !seen.has(e.link)).slice(0, 3);
  if (fresh.length === 0) return;

  const brand = await getBrand(autolist.brandId);
  const voice = brand
    ? `${brand.name}. Pillars: ${brand.pillars.map((p) => p.name).join(", ")}.`
    : undefined;

  for (const entry of fresh) {
    const variants: PostVariants = {};
    for (const platform of autolist.platforms) {
      const caption = await rewriteForPlatform(entry, platform, voice);
      assignVariant(variants, platform, caption, []);
    }
    if (Object.keys(variants).length === 0) continue;

    await createPost({
      brandId: autolist.brandId,
      workspaceId: autolist.workspaceId,
      createdBy: autolist.createdBy,
      status: "draft",
      variants,
      aiMeta: { suggested: true, reasoning: `From RSS "${autolist.name}": ${entry.title}` },
    });
    seen.add(entry.link);
    result.queued++;
  }

  await saveAutolistProgress(autolist.id, { seenLinks: [...seen] });
}

async function rewriteForPlatform(
  entry: FeedEntry,
  platform: Platform,
  voice?: string,
): Promise<string> {
  const idea = `${entry.title}. ${stripHtml(entry.description ?? "")}`.slice(0, 1500);
  if (!isAiConfigured()) return `${entry.title}\n\n${entry.link}`;
  try {
    const result = await generateCaption({ idea, platform, brandVoice: voice });
    const caption = result.options[0]?.caption ?? entry.title;
    return `${caption}\n\n${entry.link}`;
  } catch {
    return `${entry.title}\n\n${entry.link}`;
  }
}

function buildVariants(
  platforms: Platform[],
  caption: string,
  mediaAssetIds: string[],
): PostVariants {
  const variants: PostVariants = {};
  for (const platform of platforms) assignVariant(variants, platform, caption, mediaAssetIds);
  return variants;
}

function assignVariant(
  variants: PostVariants,
  platform: Platform,
  caption: string,
  mediaAssetIds: string[],
): void {
  if (platform === "ig") variants.instagram = { caption, mediaAssetIds };
  else variants.facebook = { caption, mediaAssetIds };
}

// --- Minimal RSS parsing (no dependency) --------------------------------------

interface FeedEntry {
  title: string;
  link: string;
  description?: string;
}

async function fetchFeed(url: string): Promise<FeedEntry[]> {
  const res = await fetch(url, { headers: { "User-Agent": "SignalBot/1.0" } });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseFeed(xml);
}

/** Parse RSS 2.0 / Atom well enough to extract title, link and summary per item. */
export function parseFeed(xml: string): FeedEntry[] {
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  return blocks.map((block) => ({
    title: decodeXml(tag(block, "title") ?? "Untitled"),
    link: decodeXml(tag(block, "link") ?? linkHref(block) ?? ""),
    description: decodeXml(tag(block, "description") ?? tag(block, "summary") ?? ""),
  }));
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return null;
  return m[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

/** Atom links are `<link href="…"/>` rather than text content. */
function linkHref(block: string): string | null {
  return block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? null;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}
