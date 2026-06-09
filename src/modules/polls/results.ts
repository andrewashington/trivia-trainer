import type { Poll, PollOption, PollVote, User } from "@prisma/client";

type PollWithRelations = Poll & {
  creator: { id: string; displayName: string };
  options: PollOption[];
  votes: (PollVote & { user: { id: string; displayName: string } })[];
};

export type PollResults = {
  id: string;
  question: string;
  type: "single" | "multi" | "scale";
  anonymous: boolean;
  closed: boolean;
  creatorName: string;
  isMine: boolean;
  isAdmin: boolean;
  voterCount: number;
  myOptionIds: string[];
  myRating: number | null;
  hasVoted: boolean;
  options: {
    id: string;
    label: string;
    count: number;
    /** Voter names — only populated for non-anonymous polls. */
    voters: string[];
  }[];
  /** Scale polls: counts indexed by rating 1..5, plus the average. */
  scale: { distribution: number[]; average: number | null } | null;
};

/**
 * The single place poll results are shaped for clients. Anonymity is
 * enforced HERE, server-side: anonymous polls never include voter
 * names, so no client (web today, Discord bot tomorrow) can leak them.
 */
export function pollToResults(poll: PollWithRelations, viewer: User): PollResults {
  const myVotes = poll.votes.filter((v) => v.userId === viewer.id);
  const voterCount = new Set(poll.votes.map((v) => v.userId)).size;

  const options = poll.options.map((opt) => {
    const optVotes = poll.votes.filter((v) => v.optionId === opt.id);
    return {
      id: opt.id,
      label: opt.label,
      count: optVotes.length,
      voters: poll.anonymous ? [] : optVotes.map((v) => v.user.displayName),
    };
  });

  let scale: PollResults["scale"] = null;
  if (poll.type === "scale") {
    const ratings = poll.votes
      .map((v) => v.rating)
      .filter((r): r is number => r !== null);
    const distribution = [1, 2, 3, 4, 5].map(
      (n) => ratings.filter((r) => r === n).length
    );
    scale = {
      distribution,
      average:
        ratings.length > 0
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
          : null,
    };
  }

  return {
    id: poll.id,
    question: poll.question,
    type: poll.type,
    anonymous: poll.anonymous,
    closed: poll.closedAt !== null,
    creatorName: poll.creator.displayName,
    isMine: poll.creatorId === viewer.id,
    isAdmin: viewer.role === "admin",
    voterCount,
    myOptionIds: myVotes.map((v) => v.optionId).filter((id): id is string => !!id),
    myRating: myVotes.find((v) => v.rating !== null)?.rating ?? null,
    hasVoted: myVotes.length > 0,
    options,
    scale,
  };
}
