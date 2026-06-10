import nodemailer from "nodemailer";

const BRAND = "UDM+";

// Shared brutalist shell, inline-styled to survive email clients.
function emailShell(inner: string) {
  return `
  <div style="background:#F4F1EA;padding:32px;font-family:Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border:3px solid #101010;box-shadow:6px 6px 0 #101010;padding:32px;">
      <h1 style="margin:0 0 8px;font-size:28px;color:#101010;">${BRAND}</h1>
      ${inner}
    </div>
  </div>`;
}

function brutalButton(url: string, label: string) {
  return `<a href="${url}"
     style="display:inline-block;margin-top:16px;padding:12px 24px;background:#2563FF;color:#fff;text-decoration:none;font-weight:bold;border:3px solid #101010;box-shadow:4px 4px 0 #101010;">
    ${label} &rarr;
  </a>`;
}

/**
 * Delivery: Resend HTTP API when RESEND_API_KEY is set, otherwise SMTP.
 * In dev with neither configured, the message's key link is printed to
 * the server log.
 */
async function deliver({
  to,
  subject,
  html,
  text,
  logFallback,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** What to print to the server log when no transport is configured. */
  logFallback: string;
}) {
  const from = process.env.EMAIL_FROM ?? `${BRAND} <login@localhost>`;

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
    console.log(logFallback);
    return;
  }

  throw new Error(
    "No email transport configured (set RESEND_API_KEY or SMTP_HOST)."
  );
}

export async function sendMagicLink(to: string, url: string) {
  await deliver({
    to,
    subject: `Sign in to ${BRAND}`,
    html: emailShell(`
      <p style="color:#101010;font-size:16px;line-height:1.5;">
        Here's your sign-in link. It expires in 15 minutes.
      </p>
      ${brutalButton(url, "SIGN IN")}
      <p style="margin-top:24px;color:#10101099;font-size:12px;">
        Didn't request this? You can safely ignore it.
      </p>`),
    text: `Sign in to ${BRAND}: ${url}\n\nThis link expires in 15 minutes.`,
    logFallback: `\n🔑 Magic link for ${to}:\n${url}\n`,
  });
}

export async function sendWelcomeEmail(
  to: string,
  displayName: string,
  url: string,
  signinUrl: string
) {
  await deliver({
    to,
    subject: `You're in — welcome to ${BRAND}`,
    html: emailShell(`
      <p style="color:#101010;font-size:16px;line-height:1.5;">
        Hey ${displayName} — you've been added to <strong>${BRAND}</strong>,
        the group's home base. Events, polls, recipes, friendly bets, a pet
        that feeds on the group's activity… it's all in there.
      </p>
      <p style="color:#101010;font-size:16px;line-height:1.5;">
        This link signs you in — no password, ever. It's good for 7 days.
      </p>
      ${brutalButton(url, "JUMP IN")}
      <p style="margin-top:24px;color:#10101099;font-size:12px;">
        Link expired? Get a fresh one anytime at
        <a href="${signinUrl}" style="color:#2563FF;">${signinUrl}</a> —
        just enter this email address.
      </p>`),
    text:
      `Welcome to ${BRAND}, ${displayName}!\n\n` +
      `Sign in here (link valid 7 days): ${url}\n\n` +
      `Link expired? Get a fresh one anytime at ${signinUrl} — just enter this email address.`,
    logFallback: `\n👋 Welcome link for ${to}:\n${url}\n`,
  });
}
