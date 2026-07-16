"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

/**
 * Browser-side Firebase.
 *
 * These NEXT_PUBLIC_ values are not secrets — a Firebase web API key identifies
 * the project, it does not authorise anything. Access control is enforced by
 * Firestore rules and the server-side session, never by hiding this config.
 *
 * Initialisation is lazy and config-tolerant on purpose: a Preview or CI build
 * with no Firebase env set must still compile and render. Throwing at module
 * scope would break the build rather than the one feature that needs auth.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.authDomain && config.appId);
}

function app(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_* in .env.local (see .env.example).",
    );
  }
  return getApps().length ? getApp() : initializeApp(config);
}

let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

/** Emulators are wired once per process; connecting twice throws. */
const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

export function auth(): Auth {
  if (authInstance) return authInstance;
  authInstance = getAuth(app());
  if (useEmulator) {
    connectAuthEmulator(authInstance, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return authInstance;
}

export function db(): Firestore {
  if (dbInstance) return dbInstance;
  dbInstance = getFirestore(app());
  if (useEmulator) {
    connectFirestoreEmulator(dbInstance, "127.0.0.1", 8080);
  }
  return dbInstance;
}
