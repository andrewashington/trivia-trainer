import { db } from "@/lib/db";

/**
 * Discord authors → display identity. Authors are keyed by their Discord
 * snowflake (`author_id`); only some are linked to a UDM+ User (User.discordUserId),
 * which is where a real avatar/displayName comes from. For everyone else we fall
 * back to the archived `author_name` and the deterministic DiceBear avatar that
 * the shared <Avatar> renders from a name.
 */
export type AuthorIdentity = {
  authorId: string;
  name: string;
  avatarUrl: string | null;
  userId: string | null; // linked UDM+ user, if any
};

/** Batch-resolve identities for a set of authors (pass the archived names). */
export async function resolveIdentities(
  authors: { authorId: string; authorName: string }[],
): Promise<Map<string, AuthorIdentity>> {
  const ids = [...new Set(authors.map((a) => a.authorId))];
  const linked = ids.length
    ? await db.user.findMany({
        where: { discordUserId: { in: ids } },
        select: { id: true, displayName: true, avatarUrl: true, discordUserId: true },
      })
    : [];
  const byDiscordId = new Map(linked.map((u) => [u.discordUserId!, u]));

  const out = new Map<string, AuthorIdentity>();
  for (const a of authors) {
    if (out.has(a.authorId)) continue;
    const u = byDiscordId.get(a.authorId);
    out.set(a.authorId, {
      authorId: a.authorId,
      name: u?.displayName ?? a.authorName,
      avatarUrl: u?.avatarUrl ?? null,
      userId: u?.id ?? null,
    });
  }
  return out;
}

/** Single-author convenience. */
export async function resolveIdentity(
  authorId: string,
  authorName: string,
): Promise<AuthorIdentity> {
  const map = await resolveIdentities([{ authorId, authorName }]);
  return map.get(authorId)!;
}
