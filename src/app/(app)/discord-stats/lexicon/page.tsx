import { Card } from "@/components/ui";
import { getLexicon } from "@/modules/discord-stats/insights";
import { NeedsBuild, SectionTitle } from "@/modules/discord-stats/components/parts";

export const dynamic = "force-dynamic";

export default async function LexiconPage() {
  const terms = await getLexicon();

  return (
    <div className="space-y-4">
      <SectionTitle>The group lexicon · auto-mined inside jokes</SectionTitle>
      <p className="max-w-2xl text-sm text-ink/65">
        Words and phrases this group uses that no normal person would — pulled from the archive and
        defined by an AI that read all of it.
      </p>
      {terms.length === 0 ? (
        <NeedsBuild what="The lexicon" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {terms.map((t) => (
            <Card key={t.term}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-bold text-accent-blurple">{t.term}</h3>
                {t.uses > 0 && <span className="font-mono text-[11px] text-ink/40">{t.uses.toLocaleString()}×</span>}
              </div>
              <p className="mt-1 font-body text-sm leading-snug">{t.definition}</p>
              {t.example && <p className="mt-1.5 border-l-2 border-ink/20 pl-2 text-xs italic text-ink/55">“{t.example}”</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
