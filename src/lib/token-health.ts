import "server-only";

import { getAdapter } from "@/adapters/registry";
import {
  daysUntil,
  effectiveExpiryMs,
  shouldResetWarning,
  warningThresholdToFire,
} from "@/services/token-health";

import {
  clearExpiryWarnedThreshold,
  getDecryptedToken,
  listActiveConnections,
  markConnectionExpired,
  recordTokenHealth,
  setExpiryWarnedThreshold,
} from "./db/connections";
import { notifyWorkspaceAdmins } from "./db/notifications";

/**
 * Token-health monitor — proactive expiry warnings, daily.
 *
 * The refresh engine (token-refresh.ts) keeps the *access token* alive but is
 * blind to two failure modes it can't fix: a token the user has *revoked*
 * (password change, app removed) and the *data-access* grant expiring (~90
 * days), which only a fresh reconnect resets. This monitor asks Meta directly
 * (`/debug_token`) for the real validity + expiry clocks and:
 *
 *   - marks an invalid connection `expired` and notifies admins immediately,
 *   - fires graduated pre-expiry warnings (14/7/3/1 days) — once per band, so
 *     admins get a heads-up rather than a daily nag,
 *   - stores Meta's real data-access deadline so the Settings card and
 *     dashboard banner show the true reconnect date.
 *
 * Idempotent: re-running only ever advances the warning band or updates the
 * recorded deadline. Runs AFTER the refresh pass (see /api/cron/tokens), so a
 * still-refreshable token is renewed before we'd ever warn about it.
 */

export interface TokenHealthResult {
  checked: number;
  healthy: number;
  warned: number;
  invalid: number;
  /** Couldn't reach Meta (transient) — left untouched, retried next run. */
  failed: number;
}

export async function monitorTokenHealth(now = new Date()): Promise<TokenHealthResult> {
  const connections = await listActiveConnections();
  const result: TokenHealthResult = { checked: 0, healthy: 0, warned: 0, invalid: 0, failed: 0 };
  const nowMs = now.getTime();

  for (const conn of connections) {
    result.checked++;

    let health;
    try {
      const token = await getDecryptedToken(conn);
      health = await getAdapter(conn.platform).checkTokenHealth(conn, token);
    } catch (err) {
      // Transient (network, rate limit, decrypt) — don't mistake it for a dead
      // token. Leave the connection as-is and retry next run.
      const message = err instanceof Error ? err.message : "Token health check failed.";
      console.error(`[token-health] check failed for ${conn.id} (${conn.platform}): ${message}`);
      result.failed++;
      continue;
    }

    if (!health.isValid) {
      await markConnectionExpired(
        conn.id,
        health.error ?? "Access token is no longer valid — please reconnect.",
      ).catch(() => {});
      await notifyWorkspaceAdmins(conn.workspaceId, {
        title: `Reconnect ${conn.accountName} (${conn.platform.toUpperCase()})`,
        body: "Its access token is no longer valid — publishing and analytics are paused until you reconnect it in Settings.",
        href: "/settings/connections",
      }).catch(() => {});
      result.invalid++;
      continue;
    }

    // Valid — record Meta's real deadlines for the UI.
    await recordTokenHealth(conn.id, {
      checkedAt: now.toISOString(),
      dataAccessExpiresAt: health.dataAccessExpiresAt
        ? new Date(health.dataAccessExpiresAt).toISOString()
        : undefined,
    }).catch(() => {});

    const effMs = effectiveExpiryMs(health.expiresAt, health.dataAccessExpiresAt);
    if (effMs === null) {
      // Non-expiring token with no data-access clock — nothing to warn about.
      result.healthy++;
      continue;
    }

    const daysLeft = daysUntil(effMs, nowMs);

    if (shouldResetWarning(daysLeft)) {
      if (conn.expiryWarnedThreshold !== undefined) {
        await clearExpiryWarnedThreshold(conn.id).catch(() => {});
      }
      result.healthy++;
      continue;
    }

    const fire = warningThresholdToFire(daysLeft, conn.expiryWarnedThreshold ?? null);
    if (fire === null) {
      result.healthy++;
      continue;
    }

    await setExpiryWarnedThreshold(conn.id, fire).catch(() => {});
    await notifyWorkspaceAdmins(conn.workspaceId, {
      title: `${conn.accountName} (${conn.platform.toUpperCase()}) needs reconnecting soon`,
      body: `Its access expires in about ${daysLeft} day${daysLeft === 1 ? "" : "s"} and can't be renewed automatically. Reconnect it in Settings to avoid a gap in publishing and analytics.`,
      href: "/settings/connections",
    }).catch(() => {});
    result.warned++;
  }

  return result;
}
