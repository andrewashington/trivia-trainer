import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Card, Badge } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { getMemberProfile, getLeaderboard, getConversationPartners } from "@/modules/discord-stats/queries";
import { getFingerprint } from "@/modules/discord-stats/fingerprint";
import { getDossier, getSoulmates } from "@/modules/discord-stats/insights";
import { resolveIdentities, resolveIdentity } from "@/modules/discord-stats/identity";
import { DossierCard } from "@/modules/discord-stats/components/DossierCard";
import {
  SectionTitle,
  MiniStat,
  MessageCard,
  AuthorChip,
  NeedsBuild,
} from "@/modules/discord-stats/components/parts";
import { full, hourLabel, shortDate } from "@/modules/discord-stats/format";

export const dynamic = "force-dynamic";

export default async function MemberProfilePage({ params }: { params: { authorId: string } }) {
  const { authorId } = params;
  const [profile, leaders] = await Promise.all([getMemberProfile(authorId), getLeaderboard()]);
  if (!profile) notFound();

  const [fingerprint, dossier, soulmates, partners] = await Promise.all([
    getFingerprint(authorId),
    getDossier(authorId),
    getSoulmates(authorId),
    getConversationPartners(authorId),
  ]);

  const me = await resolveIdentity(authorId, profile.authorName);
  const rank = leaders.findIndex((l) => l.authorId === authorId);
  const row = rank >= 0 ? leaders[rank] : null;

  // Resolve everyone referenced (conversation partners + soulmates).
  const partnerSeed = [
    ...partners.map((p) => ({ authorId: p.authorId, authorName: p.authorName })),
    ...soulmates.map((s) => ({ authorId: s.authorId, authorName: s.authorName })),
  ];
  const ids = await resolveIdentities(partnerSeed);

  const maxYear = Math.max(1, ...profile.byYear.map((y) => y.count));

  return (
    <div className="space-y-6">
      <Link href="/discord-stats/people" className="inline-block font-mono text-xs uppercase text-ink/50 no-underline">
        ← leaderboard
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={me.name} src={me.avatarUrl} size="lg" />
        <div>
          <h2 className="font-display text-3xl font-bold leading-none">{me.name}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {rank >= 0 && <Badge className="bg-accent-blurple text-white">#{rank + 1} by volume</Badge>}
            {me.userId && <Badge className="bg-accent-green text-ink">UDM+ member</Badge>}
            {row?.firstAt && <Badge>since {shortDate(row.firstAt)}</Badge>}
          </div>
        </div>
      </div>

      {row && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Messages" value={full(row.messages)} />
          <MiniStat label="Reactions won" value={full(row.reactionsReceived)} />
          <MiniStat label="Per message" value={row.reactionRate.toFixed(2)} />
          <MiniStat label="Avg length" value={`${row.avgLen}ch`} />
          <MiniStat label="Channels" value={row.channels} />
          <MiniStat label="Busiest hour" value={profile.busiestHour != null ? hourLabel(profile.busiestHour) : "—"} />
        </div>
      )}

      {dossier ? <DossierCard dossier={dossier} /> : <NeedsBuild what="The dossier" />}

      {fingerprint.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Verbal fingerprint</SectionTitle>
          <Card>
            <p className="mb-2 text-xs text-ink/55">Words they use way more than everyone else.</p>
            <div className="flex flex-wrap gap-2">
              {fingerprint.map((w) => (
                <span
                  key={w.word}
                  className="inline-flex items-center gap-1 border-2 border-ink bg-paper px-2 py-1 font-mono text-sm"
                  style={{ fontSize: `${Math.min(1.4, 0.8 + Math.log2(w.ratio) * 0.18)}rem` }}
                >
                  {w.word}
                  <span className="text-[10px] text-accent-blurple">×{w.ratio.toFixed(1)}</span>
                </span>
              ))}
            </div>
          </Card>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {profile.byYear.length > 0 && (
          <section className="space-y-2">
            <SectionTitle>Year by year</SectionTitle>
            <Card className="space-y-1.5">
              {profile.byYear.map((y) => (
                <div key={y.year} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 font-mono text-xs text-ink/50">{y.year}</span>
                  <div className="h-3 flex-1 border border-ink bg-paper">
                    <div className="h-full bg-accent-blurple" style={{ width: `${(y.count / maxYear) * 100}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-ink/70">
                    {full(y.count)}
                  </span>
                </div>
              ))}
            </Card>
          </section>
        )}

        <section className="space-y-2">
          <SectionTitle>Who they talk to</SectionTitle>
          <Card className="space-y-3">
            <div>
              <p className="brutal-label text-ink/50">Talks alongside (shared conversations)</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {partners.length ? (
                  partners.map((p) => (
                    <span key={p.authorId} className="flex items-center gap-1">
                      <AuthorChip identity={ids.get(p.authorId)!} />
                      <span className="font-mono text-xs text-ink/40">{p.shared.toLocaleString()}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-ink/40">A lone wolf.</span>
                )}
              </div>
            </div>
            {soulmates.length > 0 && (
              <div>
                <p className="brutal-label text-ink/50">Thinks alike (semantic)</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {soulmates.map((s) => (
                    <span key={s.authorId} className="flex items-center gap-1">
                      <AuthorChip identity={ids.get(s.authorId)!} />
                      <span className="font-mono text-xs text-accent-blurple">
                        {Math.round(s.similarity * 100)}%
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </section>
      </div>

      {profile.longest && (
        <section className="space-y-2">
          <SectionTitle>Their longest message ({profile.longest.content.length} chars)</SectionTitle>
          <Card className="bg-paper">
            <p className="line-clamp-6 whitespace-pre-wrap break-words font-body text-sm leading-snug">
              {profile.longest.content}
            </p>
            <p className="mt-2 font-mono text-[11px] uppercase text-ink/50">
              {profile.longest.channelName ? `#${profile.longest.channelName}` : ""} ·{" "}
              {shortDate(profile.longest.sentAt)}
            </p>
          </Card>
        </section>
      )}

      {profile.hallOfFame.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="trophy" size={14} /> Their greatest hits
            </span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profile.hallOfFame.map((m) => (
              <MessageCard key={m.messageId} msg={m} identity={me} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
