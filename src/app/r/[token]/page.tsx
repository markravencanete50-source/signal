import { LogoMark } from "@/components/ui/icons";
import { findReportByToken, recordView } from "@/lib/db/reports";
import { PERIOD_LABELS } from "@/lib/reports/snapshot";
import type { ReportBrandSnapshot } from "@/types";

import { PrintButton } from "./print-button";

export const metadata = { title: "Performance report" };

// Always read the latest stored snapshot; the cron/refresh keeps it current.
export const dynamic = "force-dynamic";

/**
 * Public white-label report — no auth, no app shell. Reached by bearer token
 * (`/r/{token}`). Server-rendered from the STORED snapshot via the Admin SDK
 * (never a public Firestore read, never a live Graph call — DECISIONS #005/#006).
 *
 * The client sees their agency's numbers and Claude's narrative, and can save it
 * to PDF straight from the browser. Signal is a quiet footer credit only.
 */
export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await findReportByToken(token);

  if (!report) {
    return (
      <Shell>
        <div className="py-20 text-center">
          <h1 className="text-[1.4rem] font-bold tracking-[-0.02em]">Report not found</h1>
          <p className="text-text-2 mx-auto mt-2 max-w-[360px] text-[0.9rem]">
            This report link is no longer valid. Ask whoever shared it for an up-to-date link.
          </p>
        </div>
      </Shell>
    );
  }

  // Fire-and-forget view count; never block or fail the render on it.
  await recordView(report.id).catch(() => {});

  return (
    <Shell>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.7rem] font-bold tracking-[-0.02em]">{report.title}</h1>
          <p className="text-text-2 mt-1 text-[0.9rem]">
            {PERIOD_LABELS[report.period]} · {formatRange(report.from, report.to)}
          </p>
        </div>
        <PrintButton />
      </header>

      {report.narrative && (
        <section className="mb-9">
          <p className="border-accent text-text-1 border-l-[3px] pl-4 text-[1rem] leading-[1.65]">
            {report.narrative.summary}
          </p>

          {report.narrative.recommendations.length > 0 && (
            <div className="mt-5">
              <h2 className="mb-3 text-[0.95rem] font-semibold">Recommendations</h2>
              <ul className="space-y-3">
                {report.narrative.recommendations.map((r, i) => (
                  <li key={i} className="border-border bg-surface rounded-xl border p-4">
                    <p className="text-[0.92rem] font-semibold">{r.text}</p>
                    <p className="text-text-2 mt-1 text-[0.84rem] leading-relaxed">{r.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {report.snapshot.map((brand) => (
        <BrandSection key={brand.brandId} brand={brand} />
      ))}

      <footer className="border-border text-text-2 mt-10 flex items-center gap-2 border-t pt-5 text-[0.78rem]">
        <span className="bg-accent text-accent-fg grid size-[22px] place-items-center rounded-[7px]">
          <LogoMark className="size-[13px]" />
        </span>
        Powered by Signal · refreshed {formatDateTime(report.refreshedAt)}
      </footer>
    </Shell>
  );
}

function BrandSection({ brand }: { brand: ReportBrandSnapshot }) {
  return (
    <section className="mb-9 break-inside-avoid">
      <h2 className="mb-4 text-[1.15rem] font-bold tracking-[-0.01em]">{brand.brandName}</h2>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Followers" value={brand.followers?.toLocaleString() ?? "—"} />
        <Stat
          label="Reach (period)"
          value={brand.reach?.toLocaleString() ?? "—"}
          delta={brand.reachDeltaPct}
        />
        <Stat label="Avg intent" value={brand.avgIntent !== null ? `${brand.avgIntent}` : "—"} />
      </div>

      {brand.topPosts.length > 0 && (
        <div className="border-border bg-surface overflow-hidden rounded-xl border">
          <table className="w-full text-left text-[0.84rem]">
            <thead className="border-border text-text-2 border-b text-[0.74rem] tracking-wide uppercase">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Post</th>
                <th className="px-4 py-2.5 font-semibold">Format</th>
                <th className="px-4 py-2.5 text-right font-semibold">Intent</th>
                <th className="px-4 py-2.5 text-right font-semibold">Reach</th>
              </tr>
            </thead>
            <tbody>
              {brand.topPosts.map((p, i) => (
                <tr key={i} className="border-border border-b last:border-0">
                  <td className="max-w-[280px] truncate px-4 py-2.5">{p.title}</td>
                  <td className="text-text-2 px-4 py-2.5">
                    {p.format} · {p.platform}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">{p.intentScore}</td>
                  <td className="px-4 py-2.5 text-right">{p.reach.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {brand.smartlinkClicks.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2.5 text-[0.9rem] font-semibold">SmartLink clicks by post</h3>
          <ul className="border-border bg-surface divide-border divide-y rounded-xl border">
            {brand.smartlinkClicks.map((c, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-2.5 text-[0.85rem]">
                <span className="truncate">{c.postTitle}</span>
                <span className="text-text-2 font-semibold">
                  {c.clicks.toLocaleString()} clicks
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div className="border-border bg-surface rounded-xl border p-4">
      <p className="text-text-2 text-[0.76rem] font-medium">{label}</p>
      <p className="mt-1 text-[1.4rem] font-bold tracking-[-0.01em]">{value}</p>
      {delta !== undefined && delta !== null && (
        <p
          className={`mt-0.5 text-[0.78rem] font-semibold ${delta >= 0 ? "text-success" : "text-danger"}`}
        >
          {delta >= 0 ? "+" : ""}
          {delta}% vs prior
        </p>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg min-h-screen">
      <div className="mx-auto w-full max-w-[820px] px-5 py-12">{children}</div>
    </div>
  );
}

function formatRange(from: string, to: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${new Date(from).toLocaleDateString("en-GB", opts)} – ${new Date(to).toLocaleDateString("en-GB", { ...opts, year: "numeric" })}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
