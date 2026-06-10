import nodemailer from "nodemailer";

const BRAND = "UDM+";

function magicLinkHtml(url: string) {
  // Inline-styled to survive email clients; matches the brutalist look.
  return `
  <div style="background:#F4F1EA;padding:32px;font-family:Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border:3px solid #101010;box-shadow:6px 6px 0 #101010;padding:32px;">
      <h1 style="margin:0 0 8px;font-size:28px;color:#101010;">${BRAND}</h1>
      <p style="color:#101010;font-size:16px;line-height:1.5;">
        Here's your sign-in link. It expires in 15 minutes.
      </p>
      <a href="${url}"
         style="display:inline-block;margin-top:16px;padding:12px 24px;background:#2563FF;color:#fff;text-decoration:none;font-weight:bold;border:3px solid #101010;box-shadow:4px 4px 0 #101010;">
        SIGN IN &rarr;
      </a>
      <p style="margin-top:24px;color:#10101099;font-size:12px;">
        Didn't request this? You can safely ignore it.
      </p>
    </div>
  </div>`;
}

/**
 * Delivery: Resend HTTP API when RESEND_API_KEY is set, otherwise SMTP.
 * In dev with neither configured, the link is printed to the server log.
 */
export async function sendMagicLink(to: string, url: string) {
  const subject = `Sign in to ${BRAND}`;
  const from = process.env.EMAIL_FROM ?? `${BRAND} <login@localhost>`;
  const html = magicLinkHtml(url);
  const text = `Sign in to ${BRAND}: ${url}\n\nThis link expires in 15 minutes.`;

  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      throw new Error(`Resend failed (${res.status}): ${await res.text()}`);
    }
    return;
  }

  if (process.env.SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await transport.sendMail({ from, to, subject, html, text });
    return;
  }

  // Dev always prints the link. In production, the same is allowed only
  // when ALLOW_LOG_MAGIC_LINK=true — a deliberate bridge so you can sign
  // in (and verify the deploy) BEFORE email is configured. Turn it off
  // once RESEND_API_KEY / SMTP is set: anyone who can read the server
  // logs could otherwise sign in as a member.
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_LOG_MAGIC_LINK === "true"
  ) {
    console.log(`\n🔑 Magic link for ${to}:\n${url}\n`);
    return;
  }

  throw new Error(
    "No email transport configured (set RESEND_API_KEY or SMTP_HOST)."
  );
}
