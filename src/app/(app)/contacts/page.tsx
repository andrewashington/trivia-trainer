import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { daysUntilBirthday, formatBirthday } from "@/modules/contacts/birthdays";

export const metadata = { title: "People" };
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const people = await db.user.findMany({
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      email: true,
      contactCard: { include: { relatedParties: true } },
    },
  });

  const upcoming = people
    .filter((p) => p.contactCard?.birthday)
    .map((p) => ({
      name: p.displayName,
      days: daysUntilBirthday(p.contactCard!.birthday!),
      date: formatBirthday(p.contactCard!.birthday!),
    }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        icon="contact"
        accentBg="bg-accent-pink"
        action={<LinkButton href="/me#card" variant="yellow">My card</LinkButton>}
      />

      {upcoming.length > 0 && (
        <div className="brutal-card tilt-l p-3">
          <p className="brutal-label flex items-center gap-1.5">
            <PixelIcon name="cake" size={14} /> Birthday radar
          </p>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((b) => (
              <Badge
                key={b.name}
                className={b.days <= 7 ? "bg-accent-yellow" : "bg-paper"}
              >
                {b.name} · {b.date}
                {b.days === 0 ? (
                  <>
                    {" · TODAY "}
                    <PixelIcon name="party-popper" size={12} className="-mt-0.5 inline" />
                  </>
                ) : b.days <= 14 ? (
                  ` · in ${b.days}d`
                ) : (
                  ""
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {people.map((p, i) => {
          const card = p.contactCard;
          return (
            <Card key={p.id} className={i % 2 === 0 ? "tilt-l" : "tilt-r"}>
              <Link
                href={`/people/${p.id}`}
                className="flex items-center gap-3 border-b-2 border-ink pb-2 no-underline"
                title={`${p.displayName}'s profile`}
              >
                <Avatar name={p.displayName} src={p.avatarUrl} size="sm" />
                <span className="font-display font-bold">
                  {p.id === user.id ? `${p.displayName} (you)` : p.displayName}
                </span>
                <PixelIcon name="chevron-right" size={13} className="ml-auto text-ink/40" />
              </Link>
              <dl className="mt-3 space-y-1.5 text-sm">
                <Row label="email" value={card?.email ?? p.email} href={`mailto:${card?.email ?? p.email}`} />
                {card?.phone && <Row label="phone" value={card.phone} href={`tel:${card.phone}`} />}
                {card?.birthday && (
                  <Row label="bday" value={formatBirthday(card.birthday)} />
                )}
                {card?.address && (
                  <div className="flex gap-2">
                    <dt className="w-12 shrink-0 font-mono text-xs uppercase text-ink/40 pt-0.5">addr</dt>
                    <dd className="whitespace-pre-wrap">{card.address}</dd>
                  </div>
                )}
                {card?.notes && (
                  <div className="flex gap-2">
                    <dt className="w-12 shrink-0 font-mono text-xs uppercase text-ink/40 pt-0.5">note</dt>
                    <dd className="italic text-ink/60">{card.notes}</dd>
                  </div>
                )}
              </dl>
              {card && card.relatedParties.length > 0 && (
                <div className="mt-3 border-t-2 border-dashed border-ink/30 pt-2">
                  {card.relatedParties.map((rp) => (
                    <p key={rp.id} className="text-sm">
                      <span className="font-bold">{rp.name}</span>
                      {rp.relation && (
                        <span className="font-mono text-xs text-ink/50"> ({rp.relation})</span>
                      )}
                      {rp.phone && <span className="text-ink/70"> · {rp.phone}</span>}
                      {rp.email && <span className="text-ink/70"> · {rp.email}</span>}
                    </p>
                  ))}
                </div>
              )}
              {!card && (
                <p className="mt-3 text-sm italic text-ink/40">
                  No card yet{p.id === user.id ? " — add yours!" : "."}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-12 shrink-0 font-mono text-xs uppercase text-ink/40 pt-0.5">{label}</dt>
      <dd className="min-w-0 truncate">
        {href ? (
          <a href={href} className="text-accent-blue">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
