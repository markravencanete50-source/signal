import { listPostsInRange } from "@/lib/db/posts";
import { requireTeamView } from "@/lib/auth/view-guard";
import { getAppContext } from "@/lib/workspace-context";
import { type Platform } from "@/types";

import { PlannerCalendar, type CalendarPost, type CalendarView } from "./planner-calendar";

export const metadata = { title: "Planner — Signal" };

/**
 * Planner. Month / week / day calendar of a brand's posts, colour-coded by
 * status, with drag-to-reschedule and click-to-edit.
 *
 * The server's only job is fetching a generously-buffered range around the
 * anchor — all date bucketing happens client-side in the user's LOCAL timezone
 * (the serverless clock is UTC and would bucket posts on the wrong day for
 * anyone east or west of it).
 */
export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; date?: string }>;
}) {
  await requireTeamView();
  const { activeBrand } = await getAppContext();
  const params = await searchParams;

  const view: CalendarView = ["month", "week", "day"].includes(params.view ?? "")
    ? (params.view as CalendarView)
    : "month";

  // Anchor: explicit ?date=YYYY-MM-DD, legacy ?month=YYYY-MM, else "" = the
  // browser's today (which only the client can know).
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "")
    ? params.date!
    : /^\d{4}-\d{2}$/.test(params.month ?? "")
      ? `${params.month}-01`
      : "";

  const { fromIso, toIso } = fetchBounds(anchor);
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
      view={view}
      anchor={anchor}
      posts={calendarPosts}
      brandName={activeBrand?.name ?? ""}
      canCompose={Boolean(activeBrand)}
    />
  );
}

/**
 * Fetch window: anchor (or now) ± 45 days. Deliberately wide — it covers any
 * month view, timezone drift in either direction, and week/day views without
 * per-view maths. Post volume is small enough that precision buys nothing.
 */
function fetchBounds(anchor: string): { fromIso: string; toIso: string } {
  const centre = /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? new Date(`${anchor}T00:00:00Z`) : new Date();
  const from = new Date(centre);
  from.setUTCDate(from.getUTCDate() - 45);
  const to = new Date(centre);
  to.setUTCDate(to.getUTCDate() + 45);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

function summarise(caption: string): string {
  const firstLine = caption.split("\n")[0] ?? "";
  return firstLine.slice(0, 24) || "Post";
}
