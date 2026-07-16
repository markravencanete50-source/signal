"use client";

import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { GoogleIcon, LogoMark } from "@/components/ui/icons";
import { auth, isFirebaseConfigured } from "@/lib/firebase-client";

/**
 * Login / signup form.
 *
 * Flow: authenticate with Firebase in the browser → get an ID token → POST it
 * once to /api/auth/session, which sets an httpOnly cookie. The ID token is
 * never persisted client-side; from then on the cookie is the credential.
 *
 * `router.refresh()` after sign-in matters: server components cached the
 * signed-out state, and without it the shell renders as though nobody is logged
 * in until a hard reload.
 */

type Mode = "login" | "signup";

/**
 * Firebase auth error codes → human sentences.
 *
 * The raw codes ("auth/invalid-credential") are useless to a user. Note that
 * wrong-password and unknown-email deliberately share one message: telling them
 * apart turns the login form into an account-enumeration oracle.
 */
function friendlyError(err: unknown): string {
  if (!(err instanceof FirebaseError)) {
    return err instanceof Error ? err.message : "Something went wrong. Please try again.";
  }

  switch (err.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email or password isn't right.";
    case "auth/email-already-in-use":
      return "An account with that email already exists. Try signing in instead.";
    case "auth/weak-password":
      return "Passwords need to be at least 6 characters.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again.";
    case "auth/operation-not-allowed":
      return "This sign-in method isn't enabled on the Firebase project yet.";
    default:
      return err.message;
  }
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";
  const configured = isFirebaseConfigured();

  /** Only ever a path — an absolute URL here would be an open redirect. */
  const nextPath = (() => {
    const raw = params.get("next");
    return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  })();

  async function establishSession(idToken: string) {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Could not start your session.");
    }

    // Server components rendered the signed-out tree; drop that cache.
    router.refresh();
    router.replace(nextPath);
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const credential = isSignup
        ? await createUserWithEmailAndPassword(auth(), email, password)
        : await signInWithEmailAndPassword(auth(), email, password);

      // Set the display name before minting the session, so the ID token
      // carries it and users/{uid} is seeded with a real name rather than the
      // email prefix.
      if (isSignup && name.trim()) {
        await updateProfile(credential.user, { displayName: name.trim() });
      }

      const idToken = await credential.user.getIdToken(true);
      await establishSession(idToken);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setBusy(true);

    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(auth(), provider);
      const idToken = await credential.user.getIdToken(true);
      await establishSession(idToken);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="mb-7 flex items-center gap-[10px]">
        <div className="bg-accent text-accent-fg grid size-[30px] place-items-center rounded-[9px]">
          <LogoMark />
        </div>
        <span className="font-display text-[1.15rem] font-bold tracking-[-0.02em]">Signal</span>
      </div>

      <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">
        {isSignup ? "Create your workspace" : "Welcome back"}
      </h1>
      <p className="text-text-2 mt-[3px] mb-6 text-[0.88rem]">
        {isSignup
          ? "Social performance, decoded — for every brand you manage."
          : "Sign in to pick up where you left off."}
      </p>

      {!configured && (
        <div className="bg-warning-soft text-warning mb-4 flex gap-2 rounded-[10px] px-3 py-2.5 text-[0.78rem] leading-relaxed font-medium">
          Firebase isn&rsquo;t configured. Add the <code>NEXT_PUBLIC_FIREBASE_*</code> values to
          <code> .env.local</code> — see <code>.env.example</code>.
        </div>
      )}

      <form onSubmit={handleEmail} className="flex flex-col gap-3">
        {isSignup && (
          <Field
            label="Your name"
            type="text"
            value={name}
            onChange={setName}
            autoComplete="name"
            required
          />
        )}
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={6}
        />

        {error && (
          <p role="alert" className="text-danger text-[0.8rem] font-medium">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy || !configured} className="mt-1 w-full">
          {busy ? "Just a moment…" : isSignup ? "Create account" : "Sign in"}
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3">
        <span className="bg-border h-px flex-1" />
        <span className="text-text-2 text-[0.72rem] font-medium">or</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <Button
        variant="ghost"
        onClick={handleGoogle}
        disabled={busy || !configured}
        className="w-full"
      >
        <GoogleIcon />
        Continue with Google
      </Button>

      <p className="text-text-2 mt-6 text-center text-[0.82rem]">
        {isSignup ? "Already have an account? " : "New to Signal? "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="text-accent font-semibold hover:underline"
        >
          {isSignup ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  ...rest
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.78rem] font-semibold">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-border bg-surface placeholder:text-text-2 rounded-[10px] border px-3 py-2.5 text-[0.88rem] outline-none"
        {...rest}
      />
    </label>
  );
}
