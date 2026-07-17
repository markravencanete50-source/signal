import "server-only";

import { Resend } from "resend";

import { env } from "./env";

/**
 * Resend client + a send wrapper.
 *
 * Email is OPTIONAL, like AI (lib/llm) and billing (lib/stripe): with
 * RESEND_API_KEY/EMAIL_FROM unset, `sendEmail` skips the send instead of
 * throwing, so invites, approval requests and digests still complete — the
 * shareable link (invite/approval token, report URL) is generated either way;
 * only the email delivery is off. Sending to real recipients needs a verified
 * domain, so this lets the app run fully before one exists.
 *
 * Lazily constructed so a build without the key still compiles.
 */

let client: Resend | null = null;

function resend(): Resend {
  if (!client) client = new Resend(env().RESEND_API_KEY);
  return client;
}

/** True when both the API key and a From address are set. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
}

/**
 * Send a transactional email, or skip it when email isn't configured.
 *
 * Resend reports failures in the response body rather than by throwing, so the
 * `error` field must be checked explicitly — otherwise a rejected send looks
 * exactly like a successful one and an invite silently never arrives.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ id: string }> {
  if (!isEmailConfigured()) {
    // Degrade gracefully rather than throw: the caller's flow (invite created,
    // approval requested, digest marked) completes; only delivery is skipped.
    console.warn(`[email] skipped "${params.subject}" — RESEND_API_KEY/EMAIL_FROM not set.`);
    return { id: "email-disabled" };
  }

  // Guaranteed present by isEmailConfigured() above.
  const from = env().EMAIL_FROM!;

  const { data, error } = await resend().emails.send({
    from,
    to: params.to,
    subject: params.subject,
    react: params.react,
    replyTo: params.replyTo,
  });

  if (error) {
    throw new Error(`Resend failed to send "${params.subject}": ${error.message}`);
  }
  if (!data) {
    throw new Error(`Resend returned no id for "${params.subject}"`);
  }

  return { id: data.id };
}
