import type { Metadata } from "next";

import { LogoMark } from "@/components/ui/icons";
import { getSmartLinkBySlug } from "@/lib/db/smartlinks";
import type { SmartLink } from "@/types";

// Public link-in-bio: read the latest link set + counts on each hit.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const smartlink = await getSmartLinkBySlug(slug);
  return { title: smartlink ? smartlink.title : "Link not found" };
}

/**
 * Public SmartLink page (`/s/{slug}`) — no auth, no app shell. Resolved by slug
 * via the Admin SDK (the collection is client-deny-all).
 *
 * A `?ref={postId}` on the URL is carried onto every outbound link so the click
 * redirect can attribute it to the post that drove the visit — that attribution
 * is what lets reports show which content produced clicks.
 */
export default async function SmartLinkPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { slug } = await params;
  const { ref } = await searchParams;
  const smartlink = await getSmartLinkBySlug(slug);

  if (!smartlink) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <h1 className="text-[1.3rem] font-bold tracking-[-0.02em]">Link not found</h1>
          <p className="text-text-2 mt-2 text-[0.9rem]">
            This link may have moved or no longer exists.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto w-full max-w-[400px] pt-14 text-center">
        <div
          className="mx-auto grid size-[64px] place-items-center rounded-full text-[1.2rem] font-bold text-white"
          style={{ background: smartlink.accent }}
        >
          {smartlink.avatarText}
        </div>

        <h1 className="mt-4 text-[1.25rem] font-bold tracking-[-0.02em]">{smartlink.title}</h1>
        {smartlink.subtitle && (
          <p className="text-text-2 mx-auto mt-1.5 max-w-[320px] text-[0.88rem] leading-relaxed">
            {smartlink.subtitle}
          </p>
        )}

        <div className="mt-7 space-y-2.5">
          {smartlink.links.length === 0 ? (
            <p className="text-text-2 text-[0.85rem]">No links yet.</p>
          ) : (
            smartlink.links.map((link) => (
              <LinkButton key={link.id} smartlink={smartlink} linkId={link.id} refParam={ref} />
            ))
          )}
        </div>

        <footer className="text-text-2 mt-12 flex items-center justify-center gap-1.5 pb-10 text-[0.74rem]">
          <span className="bg-accent text-accent-fg grid size-[18px] place-items-center rounded-[5px]">
            <LogoMark className="size-[11px]" />
          </span>
          Made with Signal
        </footer>
      </div>
    </Shell>
  );
}

function LinkButton({
  smartlink,
  linkId,
  refParam,
}: {
  smartlink: SmartLink;
  linkId: string;
  refParam?: string;
}) {
  const link = smartlink.links.find((l) => l.id === linkId)!;
  const params = new URLSearchParams({ s: smartlink.id, l: link.id });
  if (refParam) params.set("ref", refParam);
  const href = `/api/click?${params.toString()}`;

  return (
    <a
      href={href}
      rel="nofollow noopener"
      className="border-border bg-surface block rounded-xl border px-4 py-3 text-[0.9rem] font-semibold transition-transform hover:scale-[1.02]"
      style={
        link.hot
          ? { background: smartlink.accent, borderColor: smartlink.accent, color: "#fff" }
          : undefined
      }
    >
      {link.label}
    </a>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg min-h-screen">
      <div className="mx-auto w-full max-w-[520px] px-5">{children}</div>
    </div>
  );
}
