import type { Prisma } from "@prisma/client";

/**
 * Coin campaigns — app-wide free-coin drops that surface as a claim banner.
 *
 * Each entry is made idempotent per user by the CoinRewardClaim table:
 *   - cadence "once"  → claimable a single time, ever.
 *   - cadence "daily" → claimable once per server-local calendar day. The day
 *     is folded into the stored claim key (see {@link claimKeyFor}), so the
 *     existing @@unique([userId, rewardKey]) constraint enforces "one per day"
 *     with no schema change — a new row per user per day.
 *
 * To launch a new campaign, add an entry here and ship — that's the whole
 * mechanism. Order matters: the banner offers the first campaign a user can
 * still claim, so put the headline promo first.
 */

export type CoinRewardCadence = "once" | "daily";

export type CoinReward = {
  key: string;
  amount: number;
  cadence: CoinRewardCadence;
  title: string;
  body: string;
  cta: string;
  ledgerLabel: string;
};

export const COIN_REWARDS: CoinReward[] = [
  {
    key: "daily-1000",
    amount: 1000,
    cadence: "daily",
    title: "Your daily 1,000 coins are just sitting there",
    body: "Show up, press the button, leave 1,000 richer. Resets every day — generosity, but make it a routine.",
    cta: "Claim 1,000",
    ledgerLabel: "Daily promo",
  },
  {
    key: "world-launch-500",
    amount: 500,
    cadence: "once",
    title: "Free coins are on the table",
    body: "Take 500 coins for the World launch fund. Spend them badly, proudly, or both.",
    cta: "Claim 500",
    ledgerLabel: "Claimed a free coin drop",
  },
];

/** Server-local calendar day, e.g. "2026-06-12" — the daily reset boundary. */
export function dailyPeriodKey(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA");
}

/**
 * The idempotency key stored in CoinRewardClaim.rewardKey for one claim window.
 * One-time rewards use the bare key; daily rewards append today's date so each
 * day is a fresh, separately-claimable row under the existing unique index.
 */
export function claimKeyFor(reward: CoinReward, now: Date = new Date()): string {
  return reward.cadence === "daily"
    ? `${reward.key}:${dailyPeriodKey(now)}`
    : reward.key;
}

export function findReward(key: string): CoinReward | undefined {
  return COIN_REWARDS.find((r) => r.key === key);
}

// ── Admin overrides ───────────────────────────────────────────────────
// The active campaign set is editable in /admin (Promos tab) and stored in
// AppConfig key "coin.rewards" as a full list with an `enabled` flag per
// campaign. With no override the code array above is the live set. These
// readers import db indirectly, so call them only from server code.

export type PromoConfig = CoinReward & { enabled: boolean };

/** Every campaign for the admin editor (override list, or code defaults). */
export async function allPromos(): Promise<PromoConfig[]> {
  const { getConfig } = await import("@/lib/appConfig");
  const override = await getConfig<PromoConfig[]>("coin.rewards");
  if (Array.isArray(override)) return override;
  return COIN_REWARDS.map((r) => ({ ...r, enabled: true }));
}

/** The live, claimable campaigns (enabled only), in banner-priority order. */
export async function effectiveRewards(): Promise<CoinReward[]> {
  const promos = await allPromos();
  return promos.filter((p) => p.enabled).map(({ enabled: _enabled, ...r }) => r);
}

/** Find a claimable (enabled) reward by key — the claim route's lookup. */
export async function findRewardEffective(key: string): Promise<CoinReward | undefined> {
  return (await effectiveRewards()).find((r) => r.key === key);
}

export function rewardLedgerMeta(reward: CoinReward): Prisma.InputJsonObject {
  return {
    label: reward.ledgerLabel,
    rewardKey: reward.key,
    cadence: reward.cadence,
    title: reward.title,
  };
}
