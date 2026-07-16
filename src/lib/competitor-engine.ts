import "server-only";

import { getAdapter } from "@/adapters/registry";
import { getDecryptedToken, listConnectionsForBrand } from "./db/connections";
import { listAllCompetitors, recordSnapshot } from "./db/competitors";
import type { Connection } from "@/types";

/**
 * Competitor sync — daily public-data snapshots of tracked profiles.
 *
 * Public data only, and only via our OWN connected account's token (IG Business
 * Discovery). A competitor whose platform we don't have connected for that brand
 * is simply skipped — there's no way to read it without our own account, and we
 * won't pretend otherwise. Idempotent: snapshots are keyed by date.
 */

export interface CompetitorSyncResult {
  processed: number;
  snapshotted: number;
  skipped: number;
}

export async function runCompetitorSync(now = new Date()): Promise<CompetitorSyncResult> {
  const date = now.toISOString().slice(0, 10);
  const competitors = await listAllCompetitors();
  const result: CompetitorSyncResult = { processed: 0, snapshotted: 0, skipped: 0 };

  // Cache connections per brand so N competitors on one brand is one lookup.
  const connCache = new Map<string, Connection[]>();

  for (const competitor of competitors) {
    result.processed++;
    try {
      let connections = connCache.get(competitor.brandId);
      if (!connections) {
        connections = await listConnectionsForBrand(competitor.brandId);
        connCache.set(competitor.brandId, connections);
      }

      const connection = connections.find((c) => c.platform === competitor.platform);
      if (!connection) {
        result.skipped++;
        continue; // can't read public data without our own account on that platform
      }

      const token = await getDecryptedToken(connection);
      const profile = await getAdapter(competitor.platform).fetchPublicProfile(
        connection,
        token,
        competitor.handle,
      );
      if (!profile) {
        result.skipped++;
        continue; // private handle, or platform can't surface public data
      }

      await recordSnapshot(
        competitor.id,
        {
          date,
          followers: profile.followers,
          postsLast30d: profile.postsLast30d,
          avgEngagementRate: profile.avgEngagementRate,
        },
        profile.displayName,
      );
      result.snapshotted++;
    } catch {
      // One bad handle or dead token shouldn't sink the rest of the run.
      result.skipped++;
    }
  }

  return result;
}
