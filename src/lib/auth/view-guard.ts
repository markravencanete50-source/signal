import "server-only";

import { ForbiddenError } from "./dal";
import { getAppContext } from "../workspace-context";

/**
 * Page-level view guards.
 *
 * The sidebar already hides team-only routes from clients, but hiding is not
 * enforcement — a client who types /planner or bookmarks it must still be
 * stopped. These throw `ForbiddenError`, which the `(app)/error.tsx` boundary
 * renders as a friendly 403 rather than a crash.
 *
 * This is defence in depth over the DAL and Firestore rules, not a replacement:
 * a team-only *view* may still be built entirely from data a client could read,
 * so the block has to happen at the route.
 */

/** Reject `client` role. Use on any Create / Engage / platform-ops view. */
export async function requireTeamView(): Promise<void> {
  const { role } = await getAppContext();
  if (role === "client") {
    throw new ForbiddenError("This area is limited to your team.");
  }
}
