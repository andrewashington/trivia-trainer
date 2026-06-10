import { z } from "zod";

export const dealInput = z.object({
  bet: z.number().int().min(1),
});

export const actionInput = z.object({
  handId: z.string().min(1),
  action: z.enum(["hit", "stand", "double"]),
});

/** Shape every blackjack endpoint returns: the table as the client may see it. */
export type TableView = {
  hand: {
    id: string;
    bet: number; // total staked (doubled already reflected)
    doubled: boolean;
    status: "active" | "won" | "lost" | "push" | "blackjack";
    payout: number;
    player: string[];
    playerValue: number;
    dealer: string[];
    dealerValue: number;
    holeHidden: boolean;
  } | null;
  coins: number;
  history: {
    id: string;
    bet: number;
    status: string;
    payout: number;
    createdAt: string;
  }[];
};
