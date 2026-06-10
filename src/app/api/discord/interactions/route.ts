import { NextResponse } from "next/server";
import { botConfig, verifyInteractionSignature } from "@/lib/discord/bot";
import { handleInteraction } from "@/lib/discord/interactions";

/**
 * Discord Interactions Endpoint. Public — the Ed25519 signature over
 * (timestamp + raw body) IS the auth, so the body must be read as text
 * before parsing. Discord validates this URL with a signed PING when
 * it's saved in the dev portal, and expects bad signatures to 401.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { publicKey } = botConfig();
  if (!publicKey) {
    return NextResponse.json({ error: "Discord bot not configured." }, { status: 503 });
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const rawBody = await req.text();

  if (
    !signature ||
    !timestamp ||
    !verifyInteractionSignature(publicKey, signature, timestamp, rawBody)
  ) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  try {
    const response = await handleInteraction(JSON.parse(rawBody));
    return NextResponse.json(response);
  } catch (err) {
    console.error("[discord] interaction handler failed:", err);
    return NextResponse.json({
      type: 4,
      data: { content: "Something broke on the UDM+ side. Try again in a minute.", flags: 64 },
    });
  }
}
