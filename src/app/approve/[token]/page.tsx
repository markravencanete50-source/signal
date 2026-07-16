import { LogoMark } from "@/components/ui/icons";
import { findPostByApprovalToken } from "@/lib/db/approvals";
import { getBrand } from "@/lib/db/brands";
import { getAsset } from "@/lib/db/media";

import { DecisionForm } from "./decision-form";

export const metadata = { title: "Post approval — Signal" };

/**
 * Public approval page — no auth, no shell. Reached from the one-click email
 * link (`?d=approve|reject`). Shows the post, then a confirm button (with an
 * optional note) that records the decision.
 *
 * The email link is "one click" to this page; confirming here is what actually
 * mutates state. That two-step keeps email-scanner prefetches from silently
 * approving posts — a prefetch just loads this page, it doesn't submit the form.
 *
 * Server-rendered via the Admin SDK (never a public Firestore read), looking the
 * post up by its bearer token — DECISIONS #006.
 */
export default async function ApprovePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { token } = await params;
  const { d } = await searchParams;
  const initialDecision = d === "reject" ? "rejected" : "approved";

  const post = await findPostByApprovalToken(token);

  if (!post) {
    return (
      <Shell>
        <h1 className="text-[1.4rem] font-bold tracking-[-0.02em]">Nothing to approve</h1>
        <p className="text-text-2 mx-auto mt-2 max-w-[360px] text-[0.9rem]">
          This approval link has already been used or is no longer valid. If you think that&rsquo;s
          a mistake, ask whoever sent it to resend.
        </p>
      </Shell>
    );
  }

  const brand = await getBrand(post.brandId);
  const variant = post.variants.instagram ?? post.variants.facebook;
  const caption = variant?.caption ?? "";
  const firstAssetId = variant?.mediaAssetIds[0];
  const asset = firstAssetId ? await getAsset(firstAssetId) : null;
  const imageUrl = asset
    ? asset.type === "video"
      ? asset.secureUrl.replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg")
      : asset.secureUrl
    : null;

  const scheduledLabel = post.scheduledAt
    ? new Date(post.scheduledAt).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Shell align="left">
      <div className="mb-6 flex items-center gap-[10px]">
        <div className="bg-accent text-accent-fg grid size-[30px] place-items-center rounded-[9px]">
          <LogoMark />
        </div>
        <span className="font-display text-[1.15rem] font-bold tracking-[-0.02em]">Signal</span>
      </div>

      <h1 className="text-[1.4rem] font-bold tracking-[-0.02em]">Approve this post</h1>
      <p className="text-text-2 mt-1 text-[0.88rem]">
        {brand?.name ?? "A brand"}
        {scheduledLabel ? ` · scheduled ${scheduledLabel}` : ""}
      </p>

      <div className="border-border bg-surface mt-5 overflow-hidden rounded-2xl border">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="max-h-[360px] w-full object-cover" />
        )}
        <p className="p-4 text-[0.9rem] leading-relaxed whitespace-pre-wrap">{caption}</p>
      </div>

      <DecisionForm token={token} initialDecision={initialDecision} />
    </Shell>
  );
}

function Shell({
  children,
  align = "center",
}: {
  children: React.ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div className="bg-bg min-h-screen">
      <div
        className={`mx-auto w-full max-w-[520px] px-5 py-12 ${align === "center" ? "text-center" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
