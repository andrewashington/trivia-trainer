"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { PixelIcon } from "@/components/icons";

type Citation = {
  segmentId: string;
  channelName: string | null;
  channelId: string;
  guildId: string | null;
  at: string;
  text: string;
};

const SUGGESTIONS = [
  "When did we first talk about Lake Powell?",
  "What's our most controversial food take?",
  "Who's the biggest crypto bull in here?",
  "What running jokes do we have?",
];

export function AskBox() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || loading) return;
    setQ(text);
    setLoading(true);
    setError(null);
    setAnswer(null);
    setCitations([]);
    try {
      const res = await fetch("/api/discord-stats/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { answer: string; citations: Citation[] };
      setAnswer(data.answer);
      setCitations(data.citations ?? []);
    } catch {
      setError("The oracle choked. Try again in a sec.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="flex gap-2"
      >
        <input
          className="brutal-input flex-1"
          placeholder="Ask anything about 5 years of the group chat…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={loading} className="bg-accent-blurple text-white">
          {loading ? "…" : "Ask"}
        </Button>
      </form>

      {!answer && !loading && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="border-2 border-ink bg-card px-2.5 py-1 text-left font-mono text-xs hover:bg-paper"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="brutal-card flex items-center gap-2 text-ink/60">
          <span className="animate-spin">
            <PixelIcon name="loader" size={18} />
          </span>
          Reading the archive…
        </div>
      )}

      {error && <p className="font-mono text-sm text-accent-red">{error}</p>}

      {answer && (
        <div className="brutal-card border-accent-blurple space-y-3">
          <p className="whitespace-pre-wrap font-body leading-relaxed">{answer}</p>
          {citations.length > 0 && (
            <div className="space-y-1.5 border-t-2 border-ink/10 pt-2">
              <p className="brutal-label text-ink/50">Receipts</p>
              {citations.map((c) => {
                const link = c.guildId
                  ? `https://discord.com/channels/${c.guildId}/${c.channelId}/${c.segmentId}`
                  : null;
                const isOpen = open === c.segmentId;
                return (
                  <div key={c.segmentId} className="border-2 border-ink bg-paper">
                    <button
                      onClick={() => setOpen(isOpen ? null : c.segmentId)}
                      className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left font-mono text-[11px] uppercase text-ink/70"
                    >
                      <span>
                        {c.channelName ? `#${c.channelName}` : "?"} · {c.at.slice(0, 10)}
                      </span>
                      <PixelIcon name={isOpen ? "chevron-down" : "chevron-right"} size={12} />
                    </button>
                    {isOpen && (
                      <div className="border-t-2 border-ink/10 px-2 py-1.5">
                        <p className="whitespace-pre-wrap font-body text-xs leading-snug text-ink/80">
                          {c.text}
                        </p>
                        {link && (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block font-mono text-[11px] underline"
                          >
                            open in Discord ↗
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
