import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { ACTIVE_BRAND_COOKIE } from "@/components/layout/brand-cookie";
import type { Brand, Role, Workspace } from "@/types";

import { getCurrentUser, requireSession } from "./auth/dal";
import { listBrands } from "./db/brands";
import { getMember, getWorkspace, listWorkspacesForUser } from "./db/workspaces";

/**
 * Resolves "who is this, which workspace, which brand" once per render.
 *
 * Every authed page needs the same context, and every one of them would
 * otherwise re-derive it. Wrapped in `cache()` so the layout and the page it
 * renders share a single set of lookups.
 */

export interface AppContext {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  workspace: Workspace;
  role: Role;
  brands: Brand[];
  /** Null only when the workspace has no brands yet. */
  activeBrand: Brand | null;
}

/**
 * Resolve the caller's workspace + active brand, redirecting to onboarding when
 * they have no workspace yet.
 *
 * Brand selection order: cookie → user default → first brand. The cookie is
 * re-validated against the brand list every render, so a stale cookie (brand
 * deleted, or access revoked) silently falls back instead of rendering another
 * tenant's data or 500ing.
 */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const session = await requireSession();
  const user = await getCurrentUser();

  // Authenticated but no profile doc — the session route always writes one, so
  // this means a half-finished signup. Onboarding repairs it.
  if (!user) redirect("/onboarding");

  const workspaceId = await resolveWorkspaceId(session.uid, user.defaultWorkspaceId);
  if (!workspaceId) redirect("/onboarding");

  const [workspace, member] = await Promise.all([
    getWorkspace(workspaceId),
    getMember(workspaceId, session.uid),
  ]);

  // Membership revoked, or the workspace was deleted under them.
  if (!workspace || !member) redirect("/onboarding");

  const brands = await listBrands(workspaceId);
  const cookieBrandId = (await cookies()).get(ACTIVE_BRAND_COOKIE)?.value;

  const activeBrand = brands.find((b) => b.id === cookieBrandId) ?? brands[0] ?? null;

  return { user, workspace, role: member.role, brands, activeBrand };
});

/**
 * Pick a workspace: the user's default if still valid, else their first.
 *
 * The default is verified rather than trusted — a user removed from their
 * default workspace still has the stale id on their profile, and trusting it
 * would render a workspace they no longer belong to.
 */
async function resolveWorkspaceId(uid: string, defaultId?: string): Promise<string | null> {
  if (defaultId) {
    const member = await getMember(defaultId, uid);
    if (member) return defaultId;
  }

  const workspaces = await listWorkspacesForUser(uid);
  return workspaces[0]?.id ?? null;
}
