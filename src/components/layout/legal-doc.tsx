import Link from "next/link";

import { LogoMark } from "@/components/ui/icons";

/**
 * Shell for the public legal pages (`/privacy`, `/terms`).
 *
 * Standalone like the data-deletion status page — outside both the app and
 * marketing layouts — because a Meta reviewer (and any prospect) must reach
 * these signed-out. The reading column is wider than the auth shell's, and body
 * typography is applied once here via child selectors so each page is just
 * semantic markup.
 *
 * Colours are semantic tokens only; no `dark:` variants — the tokens flip.
 */
export function LegalDoc({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-bg min-h-screen">
      <div className="mx-auto w-full max-w-[720px] px-5 py-16">
        <Link href="/" className="mb-10 inline-flex items-center gap-[10px]">
          <span className="bg-accent text-accent-fg grid size-[30px] place-items-center rounded-[9px]">
            <LogoMark />
          </span>
          <span className="font-display text-[1.15rem] font-bold tracking-[-0.02em]">Signal</span>
        </Link>

        <h1 className="font-display text-[1.7rem] font-bold tracking-[-0.02em]">{title}</h1>
        <p className="text-text-2 mt-2 text-[0.82rem]">Last updated {updated}</p>

        <article
          className={[
            "text-text-2 mt-9 text-[0.9rem] leading-relaxed",
            "[&_h2]:text-text-1 [&_h2]:font-display [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em]",
            "[&_p]:mt-3",
            "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5",
            "[&_a]:text-accent [&_a]:font-medium",
            "[&_strong]:text-text-1 [&_strong]:font-semibold",
          ].join(" ")}
        >
          {children}
        </article>

        <footer className="border-border text-text-2 mt-14 flex gap-4 border-t pt-6 text-[0.82rem]">
          <Link href="/privacy" className="text-accent font-medium">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-accent font-medium">
            Terms of Service
          </Link>
          <Link href="/" className="ml-auto">
            Back to Signal
          </Link>
        </footer>
      </div>
    </div>
  );
}
