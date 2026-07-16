import "server-only";

import { listBrands } from "./db/brands";
import { listAssets } from "./db/media";
import { listPostsForWorkspace } from "./db/posts";
import { listReports } from "./db/reports";
import { rankResults, type Searchable, type SearchResult } from "@/services/search";
import type { Brand, Post, PostStatus } from "@/types";
import type { MediaAsset } from "@/types/media";

/** Human labels for post status in search subtitles (kept local to avoid a UI import). */
const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  pending_approval: "Awaiting approval",
  approved: "Approved",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
};

/**
 * Global-search gatherer. Pulls a bounded, workspace-scoped set of the searchable
 * entities — brands, posts, media, reports — normalises them to one shape, and
 * ranks them with the pure ranker. Everything is scoped by `workspaceId`, so one
 * tenant's search can never surface another's data.
 *
 * Post/media/brand results carry a `brandId` so the UI can switch the active
 * brand before navigating (those views are brand-scoped); reports are
 * workspace-level and carry none.
 */

export interface GroupedSearch {
  brands: SearchResult[];
  posts: SearchResult[];
  media: SearchResult[];
  reports: SearchResult[];
  total: number;
}

export async function searchWorkspace(workspaceId: string, query: string): Promise<GroupedSearch> {
  const [brands, posts, assets, reports] = await Promise.all([
    listBrands(workspaceId),
    listPostsForWorkspace(workspaceId),
    listAssets(workspaceId),
    listReports(workspaceId),
  ]);

  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  const brandResults = rankResults(query, brands.map(brandSearchable), 5);
  const postResults = rankResults(
    query,
    posts.map((p) => postSearchable(p, brandName)),
    6,
  );
  const mediaResults = rankResults(query, assets.map(mediaSearchable), 6);
  const reportResults = rankResults(query, reports.map(reportSearchable), 5);

  return {
    brands: brandResults,
    posts: postResults,
    media: mediaResults,
    reports: reportResults,
    total: brandResults.length + postResults.length + mediaResults.length + reportResults.length,
  };
}

function brandSearchable(brand: Brand): Searchable {
  return {
    type: "brand",
    id: brand.id,
    title: brand.name,
    subtitle: "Brand",
    brandId: brand.id,
    href: "/dashboard",
  };
}

function postSearchable(post: Post, brandName: Map<string, string>): Searchable {
  const caption = (post.variants.instagram ?? post.variants.facebook)?.caption ?? "";
  const title = caption.trim() ? snippet(caption) : "Untitled post";
  return {
    type: "post",
    id: post.id,
    title,
    subtitle: `${brandName.get(post.brandId) ?? "Brand"} · ${STATUS_LABEL[post.status]}`,
    brandId: post.brandId,
    href: "/planner",
    // Match the full caption + pillar, not just the truncated title.
    keywords: [caption, post.pillar ?? ""].filter(Boolean),
  };
}

function mediaSearchable(asset: MediaAsset): Searchable {
  return {
    type: "media",
    id: asset.id,
    title: assetName(asset),
    // Media is workspace-wide (no brand). Show type + folder for context.
    subtitle: asset.folder ? `${asset.type} · ${asset.folder}` : asset.type,
    href: "/media",
    keywords: asset.tags,
  };
}

function reportSearchable(report: { id: string; title: string; period: string }): Searchable {
  return {
    type: "report",
    id: report.id,
    title: report.title,
    subtitle: "Report",
    href: "/reports",
    keywords: [report.period],
  };
}

/** The last path segment of the Cloudinary id, humanised, as a display name. */
function assetName(asset: MediaAsset): string {
  const last = asset.cloudinaryPublicId.split("/").pop() ?? asset.cloudinaryPublicId;
  return last.replace(/[._-]+/g, " ").trim() || "Untitled media";
}

function snippet(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
