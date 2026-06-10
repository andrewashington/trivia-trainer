import type { Poll, PollOption, PollVote, User } from "@prisma/client";

type PollWithRelations = Poll & {
  creator: { id: string; displayName: string; avatarUrl: string | null };
  options: PollOption[];
  votes: (PollVote & { user: { id: string; displayName: string; avatarUrl: string | null } })[];
  revealVotes: { userId: string }[];
};

export type PollResults = {
  id: string;
  question: string;
  type: "single" | "multi" | "scale";
  anonymous: boolean;
  closed: boolean;
  creatorName: string;
  creatorAvatarUrl: string | null;
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
    /** Voters — only populated for non-anonymous polls. */
    voters: { name: string; avatarUrl: string | null }[];
  }[];
  /** Scale polls: counts indexed by rating 1..5, plus the average. */
  scale: { distribution: number[]; average: number | null } | null;
  /** Sealed results: hidden until revealVoteCount reaches the threshold. */
  revealThreshold: number | null;
  revealVoteCount: number;
  iVotedReveal: boolean;
  resultsHidden: boolean;
};

/**
 * The single place poll results are shaped for clients. Anonymity is
 * enforced HERE, server-side: anonymous polls never include voter
 * names, so no client (web today, Discord bot tomorrow) can leak them.
 */
export function pollToResults(poll: PollWithRelations, viewer: User): PollResults {
  const myVotes = poll.votes.filter((v) => v.userId === viewer.id);
  const voterCount = new Set(poll.votes.map((v) => v.userId)).size;

  // Sealed results stay sealed HERE, server-side: while hidden, counts,
  // voter names, and scale stats never reach a client.
  const revealVoteCount = poll.revealVotes.length;
  const resultsHidden =
    poll.revealThreshold !== null && revealVoteCount < poll.revealThreshold;

  const options = poll.options.map((opt) => {
    const optVotes = poll.votes.filter((v) => v.optionId === opt.id);
    return {
      id: opt.id,
      label: opt.label,
      count: resultsHidden ? 0 : optVotes.length,
      voters:
        poll.anonymous || resultsHidden
          ? []
          : optVotes.map((v) => ({ name: v.user.displayName, avatarUrl: v.user.avatarUrl })),
    };
  });

  let scale: PollResults["scale"] = null;
  if (poll.type === "scale" && !resultsHidden) {
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
    creatorAvatarUrl: poll.creator.avatarUrl,
    isMine: poll.creatorId === viewer.id,
    isAdmin: viewer.role === "admin",
    voterCount,
    myOptionIds: myVotes.map((v) => v.optionId).filter((id): id is string => !!id),
    myRating: myVotes.find((v) => v.rating !== null)?.rating ?? null,
    hasVoted: myVotes.length > 0,
    options,
    scale,
    revealThreshold: poll.revealThreshold,
    revealVoteCount,
    iVotedReveal: poll.revealVotes.some((v) => v.userId === viewer.id),
    resultsHidden,
  };
}
