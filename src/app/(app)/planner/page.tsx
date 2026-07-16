import { listPostsInRange } from "@/lib/db/posts";
import { requireTeamView } from "@/lib/auth/view-guard";
import { getAppContext } from "@/lib/workspace-context";
import { type Platform } from "@/types";

import { PlannerCalendar, type CalendarPost } from "./planner-calendar";

export const metadata = { title: "Planner — Signal" };

/**
 * Planner. Month calendar of a brand's posts, colour-coded by status, with
 * drag-to-reschedule and click-to-edit. Replicates the preview's `.cal`.
 *
 * The server renders the month grid and the current month's posts; the client
 * component handles month navigation, the platform filter, and drag.
 */
export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireTeamView();
  const { activeBrand } = await getAppContext();
  const params = await searchParams;

  // Month is a YYYY-MM string; default to the current month.
  const monthDate = parseMonth(params.month);
  const { fromIso, toIso } = monthBounds(monthDate);

  const posts = activeBrand ? await listPostsInRange(activeBrand.id, fromIso, toIso) : [];

  const calendarPosts: CalendarPost[] = posts
    .filter((p) => p.scheduledAt)
    .map((p) => {
      // A post can target both platforms; show a chip per targeted platform.
      const platforms = (Object.keys(p.variants) as (keyof typeof p.variants)[]).map(
        (k) => (k === "facebook" ? "fb" : "ig") as Platform,
      );
      const label = summarise(
        p.variants.instagram?.caption ?? p.variants.facebook?.caption ?? "Post",
      );
      return {
        id: p.id,
        scheduledAt: p.scheduledAt!,
        status: p.status,
        platforms,
        label,
      };
    });

  return (
    <PlannerCalendar
      month={monthKey(monthDate)}
      posts={calendarPosts}
      brandName={activeBrand?.name ?? ""}
      canCompose={Boolean(activeBrand)}
    />
  );
}

function parseMonth(month?: string): Date {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number) as [number, number];
    return new Date(Date.UTC(y, m - 1, 1));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(monthStart: Date): { fromIso: string; toIso: string } {
  // Widen by a week each side so posts spilling into adjacent-month cells load.
  const from = new Date(monthStart);
  from.setUTCDate(from.getUTCDate() - 7);
  const to = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  to.setUTCDate(to.getUTCDate() + 8);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

function summarise(caption: string): string {
  const firstLine = caption.split("\n")[0] ?? "";
  return firstLine.slice(0, 24) || "Post";
}
