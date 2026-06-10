import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";

/**
 * Mint a one-time sign-in link for a member without them requesting one
 * — used for the welcome email when an admin adds them.
 *
 * This mirrors Auth.js v5's email-provider token flow exactly (see
 * @auth/core lib/actions/signin/send-token.js): a random hex token goes
 * in the URL, and sha256(`${token}${AUTH_SECRET}`) goes in the
 * VerificationToken table. The stock /api/auth/callback/email endpoint
 * then consumes it like any magic link.
 */
const WELCOME_LINK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function appOrigin(): string {
  return new URL(process.env.AUTH_URL ?? "http://localhost:3000").origin;
}

async function createSignInLink(email: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");

  const token = randomBytes(32).toString("hex");
  await db.verificationToken.create({
    data: {
      identifier: email,
      token: createHash("sha256").update(`${token}${secret}`).digest("hex"),
      expires: new Date(Date.now() + WELCOME_LINK_MAX_AGE_MS),
    },
  });

  const origin = appOrigin();
  const params = new URLSearchParams({ callbackUrl: `${origin}/`, token, email });
  return `${origin}/api/auth/callback/email?${params}`;
}

/** Send the welcome email with a ready-to-click sign-in link. */
export async function welcomeNewMember(email: string, displayName: string) {
  const url = await createSignInLink(email);
  await sendWelcomeEmail(email, displayName, url, `${appOrigin()}/signin`);
}
