import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { listPendingApprovals, listRecentlyDecided } from "@/lib/db/approvals";
import { listBrands } from "@/lib/db/brands";
import { getAsset } from "@/lib/db/media";
import { listTeamMembers } from "@/lib/db/workspaces";
import { getAppContext } from "@/lib/workspace-context";
import type { Post } from "@/types";

import { ApprovalActions } from "./approval-actions";

export const metadata = { title: "Approvals — Signal" };

/**
 * Approvals — the queue of posts sent to clients for one-click sign-off, plus a
 * short history of recent decisions. Clients never reach this page; they act on
 * the email link. Team members (writers) nudge or record decisions here.
 */
export default async function ApprovalsPage() {
  const { workspace } = await getAppContext();

  const [pending, decided, brands, members] = await Promise.all([
    listPendingApprovals(workspace.id),
    listRecentlyDecided(workspace.id),
    listBrands(workspace.id),
    listTeamMembers(workspace.id),
  ]);

  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const nameByEmail = new Map(members.filter((m) => m.email).map((m) => [m.email, m.name]));

  // Resolve each card's preview thumbnail up front (one parallel pass).
  const thumbs = new Map(
    await Promise.all(
      [...pending, ...decided].map(async (p) => [p.id, await previewImage(p)] as const),
    ),
  );

  return (
    <>
      <div className="mb-[22px]">
        <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Approvals</h1>
        <p className="text-text-2 mt-[3px] text-[0.88rem]">
          Clients approve straight from email — no login needed
        </p>
      </div>

      {pending.length === 0 && decided.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3.5">
          {pending.map((post) => (
            <PendingCard
              key={post.id}
              post={post}
              brand={brandName.get(post.brandId)}
              clientName={
                post.approval?.requestedFrom
                  ? nameByEmail.get(post.approval.requestedFrom)
                  : undefined
              }
              image={thumbs.get(post.id)}
            />
          ))}
          {decided.map((post) => (
            <DecidedCard
              key={post.id}
              post={post}
              brand={brandName.get(post.brandId)}
              image={thumbs.get(post.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PendingCard({
  post,
  brand,
  clientName,
  image,
}: {
  post: Post;
  brand?: string;
  clientName?: string;
  image?: string;
}) {
  const sentTo = clientName ?? post.approval?.requestedFrom ?? "the client";
  return (
    <Card>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-[0.95rem] font-semibold">{postTitle(post)}</h3>
        <Chip variant="pend">Awaiting</Chip>
      </div>

      <Preview image={image} caption={captionOf(post)} />

      <div className="text-text-2 mb-3.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.76rem]">
        <ClockGlyph />
        Sent to {sentTo}
        {brand ? ` · ${brand}` : ""}
        {post.scheduledAt ? ` · scheduled ${dateLabel(post.scheduledAt)}` : ""}
      </div>

      <ApprovalActions postId={post.id} />
    </Card>
  );
}

function DecidedCard({ post, brand, image }: { post: Post; brand?: string; image?: string }) {
  // A decided post is back in the pipeline: scheduled/published/publishing means
  // approved; a bounce to draft means the client asked for changes.
  const approved = post.status !== "draft";
  const note = post.approval?.note;
  return (
    <Card>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-[0.95rem] font-semibold">{postTitle(post)}</h3>
        <Chip variant={approved ? "pub" : "draft"}>
          {approved ? "Approved" : "Changes requested"}
        </Chip>
      </div>

      <Preview image={image} caption={captionOf(post)} />

      {note && (
        <div className="bg-success-soft text-success mb-3 rounded-[10px] px-3 py-2.5 text-[0.82rem] font-medium">
          ✓ {post.approval?.decidedBy ?? "Client"}: “{note}”
        </div>
      )}

      <p className="text-text-2 text-[0.76rem]">
        {post.approval?.decidedBy ?? "Client"}
        {brand ? ` · ${brand}` : ""}
        {post.approval?.decidedAt ? ` · ${dateLabel(post.approval.decidedAt)}` : ""}
      </p>
    </Card>
  );
}

function Preview({ image, caption }: { image?: string; caption: string }) {
  return (
    <div className="mb-3 flex gap-3">
      <div
        className="bg-surface-2 size-[52px] flex-none rounded-[11px] bg-cover bg-center"
        style={image ? { backgroundImage: `url('${image}')` } : undefined}
      />
      <p className="text-text-2 line-clamp-3 text-[0.85rem] leading-[1.45]">{caption}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="text-center">
      <p className="text-[0.95rem] font-semibold">Nothing awaiting approval</p>
      <p className="text-text-2 mx-auto mt-1 max-w-[380px] text-[0.85rem]">
        When you send a post to a client from the composer, it lands here — and they can approve it
        in one click, straight from their inbox.
      </p>
    </Card>
  );
}

/** `.rep-meta` clock — inlined to match the preview rather than pulled from the icon set. */
function ClockGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="flex-none"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------

async function previewImage(post: Post): Promise<string | undefined> {
  const variant = post.variants.instagram ?? post.variants.facebook;
  const id = variant?.mediaAssetIds[0];
  if (!id) return undefined;
  const asset = await getAsset(id);
  if (!asset) return undefined;
  return asset.type === "video"
    ? asset.secureUrl.replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg")
    : asset.secureUrl;
}

function captionOf(post: Post): string {
  const variant = post.variants.instagram ?? post.variants.facebook;
  return variant?.caption ?? "";
}

/** Posts carry no title, so lead with the pillar, else the caption's opening words. */
function postTitle(post: Post): string {
  if (post.pillar) return post.pillar;
  const caption = captionOf(post).trim();
  if (!caption) return "Untitled post";
  const words = caption.split(/\s+/).slice(0, 6).join(" ");
  return words.length < caption.length ? `${words}…` : words;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
