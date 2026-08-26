import type { User } from "@prisma/client";
import type { OutboxEventType } from "@/lib/outbox";
import type { CardSpec } from "@/lib/discord/feed";
import type { Interaction } from "@/lib/discord/interactions";

/**
 * Discord feature registry — the extension seam, mirroring
 * `src/modules/registry.ts`. Each feature self-registers the slash commands,
 * context menus, component handlers and feed cards it contributes. The HTTP
 * dispatcher (`interactions.ts`), the card pipeline (`feed.ts`) and the command
 * registration script consult the registry FIRST, then fall back to the
 * built-in "core" behavior — so new features are purely additive and the
 * existing switch is left untouched.
 *
 * This is also the World seam (§8): a future `registerFeature({ key: "world",
 * ... })` adds /world commands + presence + house cards without touching
 * anything here.
 */

/** An application-command definition contributed to the register script (§6 shape). */
export type CommandDef = Record<string, unknown> & { name: string; type?: number };

/** Slash / context-menu handler. Returns an interaction-response object. */
export type CommandHandler = (user: User, interaction: Interaction) => Promise<object>;

/** Component (button / select) handler. `rest` is the custom_id tail after the head. */
export type ComponentHandler = (
  user: User,
  rest: string[],
  values?: string[]
) => Promise<object>;

/** Feed contribution for an outbox event type: a card spec and/or its buttons. */
export type FeedContribution = {
  spec?: (payload: Record<string, unknown>) => CardSpec | null;
  components?: (payload: Record<string, unknown>) => object[] | null;
};

export type DiscordFeature = {
  key: string;
  /** Command definitions merged into register-discord-commands.ts. */
  commands?: CommandDef[];
  /** command name -> handler */
  commandHandlers?: Record<string, CommandHandler>;
  /** custom_id head -> handler */
  componentHandlers?: Record<string, ComponentHandler>;
  /** outbox type -> feed card/components (extends feed.ts) */
  feed?: Partial<Record<OutboxEventType, FeedContribution>>;
};

const features: DiscordFeature[] = [];

export function registerFeature(f: DiscordFeature): void {
  if (features.some((existing) => existing.key === f.key)) return; // idempotent
  features.push(f);
}

export function allFeatures(): DiscordFeature[] {
  return features;
}

/** Find a registered slash/context-menu handler for a command name. */
export function commandHandler(name: string | undefined): CommandHandler | undefined {
  if (!name) return undefined;
  for (const f of features) {
    const h = f.commandHandlers?.[name];
    if (h) return h;
  }
  return undefined;
}

/** Find a registered component handler for a custom_id head. */
export function componentHandler(head: string | undefined): ComponentHandler | undefined {
  if (!head) return undefined;
  for (const f of features) {
    const h = f.componentHandlers?.[head];
    if (h) return h;
  }
  return undefined;
}

/** Find a registered feed contribution for an outbox event type. */
export function feedContribution(type: OutboxEventType): FeedContribution | undefined {
  for (const f of features) {
    const c = f.feed?.[type];
    if (c) return c;
  }
  return undefined;
}

/** Every command definition contributed by features (for the register script). */
export function featureCommands(): CommandDef[] {
  return features.flatMap((f) => f.commands ?? []);
}

let loaded = false;
/**
 * Load feature modules so their top-level `registerFeature(...)` side-effects
 * run. Idempotent; called once before the first dispatch/registration. New
 * feature modules are added to this list as waves land (concierge, economy, …).
 */
export async function ensureFeatures(): Promise<void> {
  if (loaded) return;
  loaded = true;
  await import("@/lib/discord/features/assistant"); // /udm catch-all assistant
  await import("@/lib/discord/features/fitness"); // The Pump's "Run it" button
  await import("@/lib/discord/features/uwu"); // /uwu live message transform
  await import("@/lib/discord/features/oxford"); // /oxford serial-comma transform
  // Wave 3: await import("@/lib/discord/features/economy");
}
