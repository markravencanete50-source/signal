import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { listReportsWithDigestDue, markDigestSent, refreshReport } from "@/lib/db/reports";
import { env } from "@/lib/env";
import { PERIOD_LABELS } from "@/lib/reports/snapshot";
import { sendEmail } from "@/lib/resend";
import { DigestEmail } from "@/emails/digest";
import type { Report, ReportBrandSnapshot } from "@/types";

/**
 * GET/POST /api/cron/digest — weekly report digests. Runs daily at 08:00 UTC;
 * each report fires on its own configured weekday.
 *
 * For every due report we re-snapshot from the latest synced data, regenerate
 * the narrative, and email it to the client — so the digest is always fresh, not
 * a stale copy. Idempotent: a report whose digest was already sent today is
 * skipped, so a same-day re-run never double-sends.
 */
export const dynamic = "force-dynamic";
// Re-snapshotting + AI narrative per report can run long.
export const maxDuration = 300;

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekday = now.getUTCDay();

  const due = await listReportsWithDigestDue(weekday);

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const report of due) {
    // Already handled today → idempotent skip.
    if (report.digest?.lastSentAt?.slice(0, 10) === today) {
      skipped++;
      continue;
    }

    try {
      const fresh = await refreshReport(report, now);
      const recipient = fresh.digest?.recipientEmail;
      if (!recipient || !fresh.narrative) {
        skipped++;
        continue; // nothing to send to, or nothing to narrate yet
      }

      await sendEmail({
        to: recipient,
        subject: `${fresh.title} — ${PERIOD_LABELS[fresh.period]}`,
        react: DigestEmail({
          reportTitle: fresh.title,
          periodLabel: PERIOD_LABELS[fresh.period],
          summary: fresh.narrative.summary,
          recommendations: fresh.narrative.recommendations,
          stats: headlineStats(fresh),
          reportUrl: `${env().APP_URL}/r/${fresh.publicToken}`,
        }),
      });

      await markDigestSent(fresh.id, now.toISOString());
      sent++;
    } catch (err) {
      failures.push(`${report.id}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return NextResponse.json({ weekday, due: due.length, sent, skipped, failures });
}

/** A few headline numbers for the email, summed across the report's brands. */
function headlineStats(report: Report): Array<{ label: string; value: string }> {
  const sum = (pick: (b: ReportBrandSnapshot) => number | null) =>
    report.snapshot.reduce((s, b) => s + (pick(b) ?? 0), 0);

  const stats: Array<{ label: string; value: string }> = [];
  const followers = sum((b) => b.followers);
  const reach = sum((b) => b.reach);
  if (followers > 0) stats.push({ label: "followers", value: followers.toLocaleString() });
  if (reach > 0) stats.push({ label: "reach this period", value: reach.toLocaleString() });
  return stats;
}

export const POST = handle;
export const GET = handle;
