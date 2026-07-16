import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * Marketing / unauthenticated shell.
 *
 * No sidebar, no brand switcher, no data fetching — none of it makes sense
 * before there's a session. Just a centred column and the theme toggle, so the
 * login page honours the user's theme like everything else.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg min-h-screen">
      <div className="absolute top-4 right-5">
        <ThemeToggle />
      </div>
      <main className="flex min-h-screen items-center justify-center px-5 py-12">{children}</main>
    </div>
  );
}
