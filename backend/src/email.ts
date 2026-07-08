import { Env } from "./env";

/**
 * Sends the OTP by email via Resend. When no API key is configured (local dev
 * and tests) it logs the code instead of sending — so tests stay offline.
 */
export async function sendOtpEmail(env: Env, email: string, otp: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    // No mail provider configured (local dev / tests). Only echo the code when
    // DEV is explicitly set, so a misconfigured PROD never leaks OTPs to logs.
    if (env.DEV === "true") console.log(`[dev] OTP for ${email}: ${otp}`);
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: email,
      subject: "Your OroQ code",
      text: `Your OroQ verification code is ${otp}. It expires in 10 minutes.`,
    }),
  });
}

/**
 * E-mails the buyer their OroQ Pro license key via Resend. Like sendOtpEmail,
 * it no-ops (logging only under DEV) when Resend isn't configured, so tests and
 * local dev stay offline.
 */
export async function sendLicenseEmail(env: Env, email: string, key: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    if (env.DEV === "true") console.log(`[dev] OroQ Pro license for ${email}: ${key}`);
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: email,
      subject: "Your OroQ Pro license key",
      text:
        "Thanks for buying OroQ Pro!\n\n" +
        "To activate, open the OroQ extension popup, click \"Enter license key\", " +
        "paste the key below, and press Activate:\n\n" +
        `${key}\n\n` +
        "Keep this e-mail — the key works offline and lets you re-activate any time.",
    }),
  });
}
