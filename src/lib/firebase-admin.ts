import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { env } from "./env";

/**
 * Server-side Firebase (Admin SDK).
 *
 * The Admin SDK **bypasses Firestore security rules entirely**. Every read and
 * write through here is fully privileged, so any handler using it must
 * independently authorise the caller first (see `lib/auth`). Rules are the
 * safety net for the *client* SDK; they will not save you here.
 *
 * This is the only sanctioned way to touch `connections/*`, whose rules deny all
 * client access.
 */
function app(): App {
  if (getApps().length) return getApp();

  // When pointed at the local emulators, the SDK talks to them regardless of
  // credentials — so skip cert parsing entirely. This lets `npm run emulators`
  // and the integration tests run without a real service-account key, and
  // `cert()` never sees a fake PEM (which node:crypto would reject).
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "signal-test",
    });
  }

  const { FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY } = env();

  return initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL,
      // Vercel stores the key with literal \n escapes rather than real newlines;
      // node:crypto rejects the PEM unless they're expanded back.
      privateKey: FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

export function adminAuth(): Auth {
  return getAuth(app());
}

export function adminDb(): Firestore {
  return getFirestore(app());
}
