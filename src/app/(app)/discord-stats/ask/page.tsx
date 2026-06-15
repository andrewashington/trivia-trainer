import { AskBox } from "@/modules/discord-stats/components/AskBox";
import { SectionTitle } from "@/modules/discord-stats/components/parts";

export const dynamic = "force-dynamic";

export default function AskPage() {
  return (
    <div className="space-y-4">
      <SectionTitle>Ask the archive · 5 years of receipts</SectionTitle>
      <p className="max-w-2xl text-sm text-ink/65">
        It has read the entire group chat — every channel, every year. Ask it who started a bit, when
        a trip first came up, or what the group really thinks about something. Answers come with the
        actual conversations they&apos;re pulled from.
      </p>
      <AskBox />
    </div>
  );
}
