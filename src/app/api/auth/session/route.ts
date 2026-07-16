import { NextResponse } from "next/server";
import { z } from "zod";

import { upsertUser } from "@/lib/db/workspaces";
import { adminAuth } from "@/lib/firebase-admin";
import { createSession, destroySession } from "@/lib/auth/session";

/**
 * Session exchange.
 *
 * The browser authenticates with Firebase client-side (email/password or Google
 * popup), gets an ID token, and POSTs it here exactly once. We verify it and set
 * an httpOnly session cookie; the ID token is never stored client-side.
 *
 * This is why the client SDK's own persistence isn't relied on: an ID token in
 * JS-readable storage is XSS-exfiltratable and expires hourly. A session cookie
 * is httpOnly, longer-lived, and revocable server-side.
 */

const bodySchema = z.object({
  idToken: z.string().min(1, "idToken is required"),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 });
  }

  try {
    // Verify BEFORE trusting any claim. createSession re-verifies and also
    // enforces recency, but we need the decoded claims here to seed the profile.
    const decoded = await adminAuth().verifyIdToken(parsed.data.idToken, true);

    await createSession(parsed.data.idToken);

    // Mirror the auth identity into users/{uid} so the app has a profile to read.
    // Sourced from verified token claims, never from client-supplied JSON —
    // otherwise anyone could POST an arbitrary name/email for their account.
    await upsertUser({
      uid: decoded.uid,
      email: decoded.email ?? "",
      name: decoded.name ?? decoded.email?.split("@")[0] ?? "New user",
      avatarUrl: decoded.picture,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create session";
    // 401 not 500: this is almost always an expired or forged token.
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
