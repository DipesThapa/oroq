import { Env } from "./env";

/**
 * Sends the OTP by email via Resend. When no API key is configured (local dev
 * and tests) it logs the code instead of sending — so tests stay offline.
 */
export async function sendOtpEmail(env: Env, email: string, otp: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    console.log(`[dev] OTP for ${email}: ${otp}`);
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
