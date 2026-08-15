import type { User } from "@prisma/client";
import { registerFeature } from "@/lib/discord/registry";
import { adoptPlan } from "@/modules/fitness/service";
import { HttpError } from "@/lib/session";

/**
 * The Pump's Discord surface: the "🏃 Run it" button on NEW PROGRAM cards.
 * custom_id: pumprun:adopt:<planId> — the id is just an address (§0.2);
 * adoptPlan re-fetches the plan and the unique constraint guards replays.
 * The button goes through the same service call as the web route, so the
 * coin + the live status-line rewrite are identical either way.
 */

const EPHEMERAL = 64;
const reply = (content: string) => ({ type: 4, data: { content, flags: EPHEMERAL } });

async function handlePumpRun(user: User, rest: string[]): Promise<object> {
  const [action, planId] = rest;
  if (action !== "adopt" || !planId) return reply("That button doesn't lift anymore.");
  try {
    const plan = await adoptPlan(user.id, planId);
    return reply(`💪 You're running **${plan.title}**. The program is watching now.`);
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) {
      return reply("You're already running it. The barbell remembers.");
    }
    if (err instanceof HttpError && err.status === 404) {
      return reply("That program got deleted. A mercy, possibly.");
    }
    throw err;
  }
}

registerFeature({
  key: "fitness",
  componentHandlers: { pumprun: handlePumpRun },
});
