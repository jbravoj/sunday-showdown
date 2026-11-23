// Sends email through a Gmail account using an app password.
//
// Setup (once):
//   firebase functions:secrets:set GMAIL_USER          → the Gmail address
//   firebase functions:secrets:set GMAIL_APP_PASSWORD  → a 16-letter app password
// Admin alerts go to GMAIL_USER. If the secrets are blank or Gmail refuses,
// the email is skipped and logged; nothing else fails.

import nodemailer from "nodemailer";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import type { Mail } from "../../shared/notify.ts";

export const GMAIL_USER = defineSecret("GMAIL_USER");
export const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
export const MAIL_SECRETS = [GMAIL_USER, GMAIL_APP_PASSWORD];

/** Sends `mail` to `to`, or to the admin when `to` is omitted. True if Gmail accepted it. */
export async function sendMail(mail: Mail, to?: string): Promise<boolean> {
  try {
    const user = GMAIL_USER.value().trim();
    const pass = GMAIL_APP_PASSWORD.value().replace(/\s+/g, "");
    if (!user || !pass) {
      logger.warn("Email skipped: GMAIL_USER / GMAIL_APP_PASSWORD not set.");
      return false;
    }
    const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    await transport.sendMail({
      from: `"Sunday Showdown" <${user}>`,
      to: to ?? user,
      replyTo: user,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch (err) {
    logger.error("Email failed", { to: to ?? "admin", subject: mail.subject, err: String(err) });
    return false;
  }
}
