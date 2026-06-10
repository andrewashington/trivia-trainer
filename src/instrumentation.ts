/**
 * Next.js server-boot hook (experimental.instrumentationHook). Starts
 * the Discord outbox drainer once per server process; inert when
 * DISCORD_WEBHOOK_URL is unset.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDiscordDrainer } = await import("@/lib/discord/drainer");
    startDiscordDrainer();
  }
}
