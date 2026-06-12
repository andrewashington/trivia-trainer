import type { Prisma } from "@prisma/client";

export type ActiveCoinReward = {
  key: string;
  amount: number;
  title: string;
  body: string;
  cta: string;
  ledgerLabel: string;
};

export const ACTIVE_COIN_REWARD: ActiveCoinReward = {
  key: "world-launch-500",
  amount: 500,
  title: "Free coins are on the table",
  body: "Take 500 coins for the World launch fund. Spend them badly, proudly, or both.",
  cta: "Claim 500",
  ledgerLabel: "Claimed a free coin drop",
};

export function rewardLedgerMeta(reward: ActiveCoinReward): Prisma.InputJsonObject {
  return {
    label: reward.ledgerLabel,
    rewardKey: reward.key,
    title: reward.title,
  };
}
