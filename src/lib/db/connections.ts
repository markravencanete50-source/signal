import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import type { TokenSet } from "@/adapters/types";
import type { Connection, ConnectionStatus, Platform, PublicConnection } from "@/types";

import { decryptToken, encryptToken } from "../crypto";
import { adminDb } from "../firebase-admin";

/**
 * Connections repository — the ONLY module that decrypts platform tokens.
 *
 * Firestore rules deny every client read of `connections/*`, so this file (via
 * the Admin SDK) is the sole access path. Keeping decryption here means there is
 * exactly one place to audit for token leakage, and `toPublicConnection()` is
 * the only door out to the browser.
 */

const COLLECTION = "connections";

function docToConnection(id: string, data: FirebaseFirestore.DocumentData): Connection {
  return { id, ...data } as Connection;
}

/**
 * Strip a connection down to what may safely reach a browser.
 *
 * Built by explicit field selection, never by spreading and deleting: if someone
 * later adds `refreshTokenEnc` to `Connection`, a spread-based version would
 * publish it automatically. This one keeps it out by default.
 */
export function toPublicConnection(conn: Connection): PublicConnection {
  const expiresAt = new Date(conn.tokenExpiresAt);
  const daysUntilExpiry = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);

  return {
    id: conn.id,
    brandId: conn.brandId,
    platform: conn.platform,
    accountName: conn.accountName,
    status: conn.status,
    tokenExpiresAt: conn.tokenExpiresAt,
    lastSyncAt: conn.lastSyncAt,
    lastError: conn.lastError,
    connectedByName: conn.connectedByName,
    daysUntilExpiry,
  };
}

export async function getConnection(id: string): Promise<Connection | null> {
  const snap = await adminDb().doc(`${COLLECTION}/${id}`).get();
  if (!snap.exists) return null;
  return docToConnection(snap.id, snap.data()!);
}

export async function listConnectionsForBrand(brandId: string): Promise<Connection[]> {
  const snap = await adminDb().collection(COLLECTION).where("brandId", "==", brandId).get();
  return snap.docs.map((d) => docToConnection(d.id, d.data()));
}

export async function listConnectionsForWorkspace(workspaceId: string): Promise<Connection[]> {
  const snap = await adminDb().collection(COLLECTION).where("workspaceId", "==", workspaceId).get();
  return snap.docs.map((d) => docToConnection(d.id, d.data()));
}

/** Every active connection across all workspaces — the sync cron's work list. */
export async function listActiveConnections(): Promise<Connection[]> {
  const snap = await adminDb().collection(COLLECTION).where("status", "==", "active").get();
  return snap.docs.map((d) => docToConnection(d.id, d.data()));
}

/**
 * Connections whose token expires within `days` — the token-refresh cron's work
 * list. Uses the (status, tokenExpiresAt) index.
 */
export async function listExpiringConnections(withinIso: string): Promise<Connection[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("status", "==", "active")
    .where("tokenExpiresAt", "<=", withinIso)
    .get();
  return snap.docs.map((d) => docToConnection(d.id, d.data()));
}

/**
 * Decrypt a connection's access token for adapter use.
 *
 * Never return this to a caller that might serialise it — it is for handing
 * straight to an adapter method and then dropping. A decryption failure means
 * the key rotated or the row was tampered with; either way the connection is
 * unusable and must be reconnected, so it is marked `error` rather than left to
 * fail confusingly on every cron run.
 */
export async function getDecryptedToken(conn: Connection): Promise<string> {
  try {
    return decryptToken(conn.accessTokenEnc);
  } catch (err) {
    await markConnectionError(
      conn.id,
      "Stored token could not be decrypted. It must be reconnected.",
    );
    throw new Error(
      `Connection ${conn.id} has an undecryptable token (key rotated or data corrupted). Marked as error.`,
      { cause: err },
    );
  }
}

/**
 * Create or update a brand's connection for a platform.
 *
 * Keyed deterministically on `${brandId}_${platform}` so reconnecting the same
 * account overwrites in place rather than accumulating duplicate rows that the
 * publish cron would then double-publish through.
 */
export async function upsertConnection(params: {
  brandId: string;
  workspaceId: string;
  platform: Platform;
  tokens: TokenSet;
  connectedByName?: string;
}): Promise<string> {
  const { brandId, workspaceId, platform, tokens, connectedByName } = params;
  const id = `${brandId}_${platform}`;

  const payload: Omit<Connection, "id"> = {
    brandId,
    workspaceId,
    platform,
    pageId: tokens.pageId,
    igUserId: tokens.igUserId,
    accessTokenEnc: encryptToken(tokens.accessToken),
    tokenExpiresAt: tokens.expiresAt.toISOString(),
    scopes: tokens.scopes,
    status: "active",
    accountName: tokens.accountName,
    connectedByName,
    metaUserId: tokens.authorizingUserId,
  };

  // Firestore rejects explicit undefined; strip rather than write nulls, which
  // would break `igUserId ?? conn.igUserId` fallbacks elsewhere.
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));

  await adminDb().doc(`${COLLECTION}/${id}`).set(clean, { merge: true });
  return id;
}

/** Store a refreshed token, clearing any prior error state. */
export async function updateConnectionToken(id: string, tokens: TokenSet): Promise<void> {
  await adminDb()
    .doc(`${COLLECTION}/${id}`)
    .update({
      accessTokenEnc: encryptToken(tokens.accessToken),
      tokenExpiresAt: tokens.expiresAt.toISOString(),
      status: "active" satisfies ConnectionStatus,
      // Clear the field rather than writing null: `lastError` is optional, and a
      // null would render as a phantom error on the health card.
      lastError: FieldValue.delete(),
    });
}

export async function markConnectionError(id: string, error: string): Promise<void> {
  await adminDb()
    .doc(`${COLLECTION}/${id}`)
    .update({ status: "error" satisfies ConnectionStatus, lastError: error });
}

export async function markConnectionExpired(id: string, error: string): Promise<void> {
  await adminDb()
    .doc(`${COLLECTION}/${id}`)
    .update({ status: "expired" satisfies ConnectionStatus, lastError: error });
}

export async function touchLastSync(id: string): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${id}`).update({ lastSyncAt: new Date().toISOString() });
}

export async function deleteConnection(id: string): Promise<void> {
  await adminDb().doc(`${COLLECTION}/${id}`).delete();
}

/**
 * Connections a given Meta user authorised — the deauthorize / data-deletion
 * callbacks arrive keyed by this app-scoped id. Empty when nothing matches (e.g.
 * a connection made before we started recording it).
 */
export async function listConnectionsByMetaUser(metaUserId: string): Promise<Connection[]> {
  const snap = await adminDb().collection(COLLECTION).where("metaUserId", "==", metaUserId).get();
  return snap.docs.map((d) => docToConnection(d.id, d.data()));
}
