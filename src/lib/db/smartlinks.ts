import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "../firebase-admin";
import { initials, slugify, uniqueSlug } from "../smartlink/slug";
import { getPost } from "./posts";
import type { Brand, SmartLink, SmartLinkAttribution, SmartLinkItem } from "@/types";

/**
 * SmartLink repository — the link-in-bio page and its click attribution.
 *
 * One SmartLink per brand, addressed publicly by `slug`. Click aggregates live
 * on the link rows and, when a visit carried `?ref={postId}`, on a per-post
 * attribution doc — aggregates only, never raw click events (rule #5). Every
 * access is Admin-SDK server-side; the collection is client-deny-all.
 */

const SMARTLINKS = "smartlinks";
const ATTRIBUTION = "smartlinkClicks";

export async function getSmartLink(id: string): Promise<SmartLink | null> {
  const snap = await adminDb().doc(`${SMARTLINKS}/${id}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as SmartLink;
}

export async function getSmartLinkByBrand(brandId: string): Promise<SmartLink | null> {
  const snap = await adminDb()
    .collection(SMARTLINKS)
    .where("brandId", "==", brandId)
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return { id: doc.id, ...doc.data() } as SmartLink;
}

/** Resolve a SmartLink by its public slug — for the public `/s/{slug}` page. */
export async function getSmartLinkBySlug(slug: string): Promise<SmartLink | null> {
  const snap = await adminDb().collection(SMARTLINKS).where("slug", "==", slug).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return { id: doc.id, ...doc.data() } as SmartLink;
}

/**
 * The brand's SmartLink, created with sensible defaults on first access so the
 * editor always has something to edit. Slug is derived from the brand name and
 * de-duplicated across the whole collection.
 */
export async function getOrCreateSmartLink(brand: Brand): Promise<SmartLink> {
  const existing = await getSmartLinkByBrand(brand.id);
  if (existing) return existing;

  const all = await adminDb().collection(SMARTLINKS).select("slug").get();
  const taken = new Set(all.docs.map((d) => d.get("slug") as string));
  const slug = uniqueSlug(brand.name, taken);

  const ref = adminDb().collection(SMARTLINKS).doc();
  const now = new Date().toISOString();
  const smartlink: Omit<SmartLink, "id"> = {
    workspaceId: brand.workspaceId,
    brandId: brand.id,
    slug,
    title: brand.name,
    subtitle: "",
    avatarText: initials(brand.name),
    accent: brand.color,
    links: [],
    totalClicks: 0,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(smartlink);
  return { id: ref.id, ...smartlink };
}

export interface SmartLinkPatch {
  title: string;
  subtitle: string;
  avatarText: string;
  accent: string;
  slug: string;
  links: SmartLinkItem[];
}

/**
 * Save editor changes. Preserves each link's accumulated `clicks` by id, so
 * re-ordering or renaming a link never resets its counter; new links start at 0.
 * Rejects a slug already used by another SmartLink.
 */
export async function updateSmartLink(id: string, patch: SmartLinkPatch): Promise<void> {
  const current = await getSmartLink(id);
  if (!current) throw new Error("SmartLink not found.");

  const desiredSlug = slugify(patch.slug) || current.slug;
  if (desiredSlug !== current.slug) {
    const clash = await getSmartLinkBySlug(desiredSlug);
    if (clash && clash.id !== id) throw new Error("That link address is already taken.");
  }

  const priorClicks = new Map(current.links.map((l) => [l.id, l.clicks]));
  const links: SmartLinkItem[] = patch.links.map((l) => ({
    id: l.id,
    label: l.label,
    url: l.url,
    hot: l.hot,
    clicks: priorClicks.get(l.id) ?? 0,
  }));

  await adminDb().doc(`${SMARTLINKS}/${id}`).update({
    title: patch.title,
    subtitle: patch.subtitle,
    avatarText: patch.avatarText,
    accent: patch.accent,
    slug: desiredSlug,
    links,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Record a click and return the destination URL (or null if the link is gone).
 *
 * Increments the link's counter and the page total atomically. When `ref` names
 * a post in this SmartLink's workspace, also bumps that post's attribution
 * aggregate — that's what lets reports say which post drove the click.
 */
export async function recordClick(
  smartlinkId: string,
  linkId: string,
  ref: string | null,
): Promise<string | null> {
  const smartlink = await getSmartLink(smartlinkId);
  if (!smartlink) return null;

  const idx = smartlink.links.findIndex((l) => l.id === linkId);
  if (idx === -1) return null;

  const links = smartlink.links.map((l, i) => (i === idx ? { ...l, clicks: l.clicks + 1 } : l));
  await adminDb()
    .doc(`${SMARTLINKS}/${smartlinkId}`)
    .update({ links, totalClicks: FieldValue.increment(1) });

  if (ref) await attributeClick(smartlink, ref).catch(() => {});

  return smartlink.links[idx]!.url;
}

/**
 * Bump the per-post click aggregate. The post must belong to this SmartLink's
 * workspace — a forged `ref` pointing at another tenant's post is ignored, so
 * the param can't be used to write into someone else's attribution.
 */
async function attributeClick(smartlink: SmartLink, postId: string): Promise<void> {
  const post = await getPost(postId);
  if (!post || post.workspaceId !== smartlink.workspaceId) return;

  const variant = post.variants.instagram ?? post.variants.facebook;
  const caption = variant?.caption?.trim() ?? "";
  const title = caption ? caption.split(/\s+/).slice(0, 6).join(" ") : "Untitled post";

  const ref = adminDb().doc(`${ATTRIBUTION}/${postId}`);
  await ref.set(
    {
      postId,
      brandId: smartlink.brandId,
      workspaceId: smartlink.workspaceId,
      postTitle: title,
      clicks: FieldValue.increment(1),
      lastClickAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/** Per-post attributed clicks for a brand, most clicks first — read by reports. */
export async function listAttribution(brandId: string): Promise<SmartLinkAttribution[]> {
  const snap = await adminDb().collection(ATTRIBUTION).where("brandId", "==", brandId).get();
  return snap.docs.map((d) => d.data() as SmartLinkAttribution).sort((a, b) => b.clicks - a.clicks);
}
