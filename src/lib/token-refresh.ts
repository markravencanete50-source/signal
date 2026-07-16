import "server-only";

import { getAdapter } from "@/adapters/registry";
import {
  getDecryptedToken,
  listExpiringConnections,
  markConnectionExpired,
  updateConnectionToken,
} from "./db/connections";
import { notifyWorkspaceAdmins } from "./db/notifications";

/**
 * Token-refresh engine — keeps long-lived Meta tokens alive.
 *
 * Meta's long-lived tokens last ~60 days; a dead token silently breaks every
 * publish and sync for that brand. This runs daily, refreshes anything expiring
 * within the window, and — when a refresh genuinely fails (auth error, or the
 * token is already past expiry) — marks the connection `expired` and nudges the
 * workspace admins to reconnect. A transient failure is left `active` so the next
 * run simply retries; the whole thing is idempotent.
 */

// Refresh this far ahead of expiry, so there's a week of retries before a token
// actually dies.
const REFRESH_WINDOW_DAYS = 7;

export interface TokenRefreshResult {
  checked: number;
  refreshed: number;
  expired: number;
  deferred: number;
}

export async function refreshExpiringTokens(now = new Date()): Promise<TokenRefreshResult> {
  const within = new Date(now.getTime() + REFRESH_WINDOW_DAYS * 86_400_000).toISOString();
  const connections = await listExpiringConnections(within);

  const result: TokenRefreshResult = { checked: 0, refreshed: 0, expired: 0, deferred: 0 };

  for (const conn of connections) {
    result.checked++;
    try {
      const token = await getDecryptedToken(conn);
      const next = await getAdapter(conn.platform).refreshToken(conn, token);
      await updateConnectionToken(conn.id, next);
      result.refreshed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token refresh failed.";
      const alreadyExpired = new Date(conn.tokenExpiresAt).getTime() <= now.getTime();

      if (alreadyExpired || looksLikeAuthError(message)) {
        await markConnectionExpired(
          conn.id,
          "Access token could not be refreshed — please reconnect.",
        ).catch(() => {});
        await notifyWorkspaceAdmins(conn.workspaceId, {
          title: `Reconnect ${conn.accountName} (${conn.platform.toUpperCase()})`,
          body: "Its access token is expiring and couldn't be refreshed automatically. Reconnect it in Settings so publishing and analytics keep working.",
          href: "/settings/connections",
        }).catch(() => {});
        result.expired++;
      } else {
        // Transient (network, rate limit) — keep it active and try again next run.
        result.deferred++;
      }
    }
  }

  return result;
}

/** Heuristic: does this error mean the token is dead (vs a transient failure)? */
function looksLikeAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("token") || m.includes("expired") || m.includes("reconnect") || m.includes("oauth")
  );
}
