import "server-only";

import { env } from "@/lib/env";

/**
 * Shared Meta Graph API plumbing for the FB + IG adapters.
 *
 * Nothing outside `src/adapters/` may import this. It is the single choke point
 * where Signal talks to Meta, which is what keeps a future platform a drop-in
 * rather than a refactor.
 */

/**
 * Pinned Graph version. Meta deprecates versions on a ~2-year clock and
 * unversioned calls silently follow the latest, which changes behaviour under
 * you. Bump deliberately and re-run the adapter tests.
 */
export const GRAPH_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Scopes requested at OAuth. Each must be justified in App Review — see README. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "instagram_manage_comments",
] as const;

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * A Graph API error, carrying Meta's codes so callers can react to *why* rather
 * than string-matching a message.
 */
export class GraphError extends Error {
  readonly code: number | undefined;
  readonly subcode: number | undefined;
  readonly status: number;
  readonly traceId: string | undefined;

  constructor(status: number, body: GraphErrorBody) {
    super(body.error?.message ?? `Graph API request failed with ${status}`);
    this.name = "GraphError";
    this.status = status;
    this.code = body.error?.code;
    this.subcode = body.error?.error_subcode;
    this.traceId = body.error?.fbtrace_id;
  }

  /**
   * True when the token is dead and no retry will help — the user must
   * reconnect. 190 = invalid/expired token; 102 = session invalidated.
   * Distinguishing this from a transient error is what stops the token cron
   * retrying a permanently-broken connection forever.
   */
  get isAuthError(): boolean {
    return this.code === 190 || this.code === 102 || this.status === 401;
  }

  /** Rate limiting (4, 17, 32, 613) or a 5xx — worth backing off and retrying. */
  get isTransient(): boolean {
    if (this.status >= 500) return true;
    return [4, 17, 32, 613].includes(this.code ?? -1);
  }
}

/**
 * Typed Graph request.
 *
 * Returns `unknown`-shaped `T` by caller assertion. Callers must narrow before
 * use — the no-`any` rule in adapters exists precisely so a surprise payload
 * shape fails at the boundary rather than three layers deep in a service.
 */
export async function graphFetch<T>(
  path: string,
  options: {
    accessToken: string;
    method?: "GET" | "POST" | "DELETE";
    params?: Record<string, string | undefined>;
    signal?: AbortSignal;
  },
): Promise<T> {
  const { accessToken, method = "GET", params = {}, signal } = options;

  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  const init: RequestInit = { method, signal };

  if (method === "POST") {
    // POST bodies keep the token and long captions out of the URL, which would
    // otherwise land in Meta's access logs and any proxy in between.
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) body.set(k, v);
    }
    body.set("access_token", accessToken);
    init.body = body;
    url.search = "";
  } else {
    url.searchParams.set("access_token", accessToken);
  }

  const res = await fetch(url, init);
  const text = await res.text();

  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new GraphError(res.status, {
      error: { message: `Non-JSON response: ${text.slice(0, 200)}` },
    });
  }

  if (!res.ok) {
    throw new GraphError(res.status, json as GraphErrorBody);
  }

  return json as T;
}

/**
 * Exchange a short-lived token for a long-lived (~60 day) one.
 *
 * Must run immediately on connect. Short-lived tokens expire in ~1 hour, so
 * storing one produces a connection that works during testing and is dead by
 * the time the publish cron next fires.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const { META_APP_ID, META_APP_SECRET } = env();

  const res = await graphFetch<{ access_token: string; expires_in?: number }>(
    "/oauth/access_token",
    {
      accessToken: shortLivedToken,
      params: {
        grant_type: "fb_exchange_token",
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: shortLivedToken,
      },
    },
  );

  const expiresAt = new Date();
  // Page tokens derived from a long-lived user token can come back without
  // expires_in, meaning "does not expire". Treat that as 60 days anyway so the
  // refresh cron still re-validates it rather than trusting it forever.
  expiresAt.setSeconds(expiresAt.getSeconds() + (res.expires_in ?? 60 * 24 * 60 * 60));

  return { accessToken: res.access_token, expiresAt };
}

/** OAuth redirect URI. Must byte-match a URI whitelisted in the Meta app config. */
export function redirectUri(): string {
  return `${env().APP_URL}/api/auth/meta/callback`;
}
