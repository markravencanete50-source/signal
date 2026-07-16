import "server-only";

import { Resend } from "resend";

import { env } from "./env";

/**
 * Resend client + a send wrapper.
 *
 * Lazily constructed so a build without RESEND_API_KEY still compiles — the key
 * is only needed when an email is actually sent.
 */

let client: Resend | null = null;

function resend(): Resend {
  if (!client) client = new Resend(env().RESEND_API_KEY);
  return client;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
}

/**
 * Send a transactional email.
 *
 * Resend reports failures in the response body rather than by throwing, so the
 * `error` field must be checked explicitly — otherwise a rejected send looks
 * exactly like a successful one and an invite silently never arrives.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ id: string }> {
  const { EMAIL_FROM } = env();

  const { data, error } = await resend().emails.send({
    from: EMAIL_FROM,
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
