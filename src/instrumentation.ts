/**
 * Next.js server-boot hook (experimental.instrumentationHook). Starts
 * the Discord outbox drainer and scheduler once per server process; both
 * no-op when Discord is unconfigured.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDiscordDrainer } = await import("@/lib/discord/drainer");
    startDiscordDrainer();
    const { startDiscordScheduler } = await import("@/lib/discord/scheduler");
    startDiscordScheduler();
    const { startUwuPoller } = await import("@/lib/discord/uwuPoller");
    startUwuPoller();
  }
}
