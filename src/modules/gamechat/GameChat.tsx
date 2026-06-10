"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Avatar } from "@/components/ui";
import type { GameChatMessagePayload } from "@/app/api/arcade/chat/route";

const POLL_MS = 4000;

// Canned quips — one tap of smack talk. Players taunt, the crowd heckles.
const PLAYER_QUIPS = [
  "You call that aiming?",
  "My grandma shoots straighter.",
  "Enjoy the crater. 💥",
  "Wind's on MY side today.",
  "Is your tank okay? It looks nervous.",
  "That was a warning shot. The next one isn't.",
  "GG already? We just started.",
];
const CROWD_QUIPS = [
  "🍿🍿🍿",
  "OOOOHHHH!!",
  "Booooo!",
  "Finish them!",
  "Worst shot I've seen all week.",
  "I've got coins on this one.",
  "Both of you are terrible. Keep going.",
];

/**
 * Polling chat panel for games. `channel` scopes the conversation
 * ("tanks:<gameId>" today; snake/trivia can reuse it with their own prefix).
 */
export function GameChat({
  channel,
  meId,
  isPlayer,
}: {
  channel: string;
  meId: string;
  isPlayer: boolean;
}) {
  const [messages, setMessages] = useState<GameChatMessagePayload[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | null>(null);

  // Load + poll. Replace-on-fetch keeps it dead simple; 60 messages max.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await api<{ messages: GameChatMessagePayload[] }>(
          `/api/arcade/chat?channel=${encodeURIComponent(channel)}`
        );
        if (alive) setMessages(res.messages);
      } catch {
        // transient — next poll will catch up
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [channel]);

  // Stick to the bottom when new messages arrive.
  useEffect(() => {
    const last = messages[messages.length - 1]?.id ?? null;
    if (last && last !== lastIdRef.current) {
      lastIdRef.current = last;
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await api<{ message: GameChatMessagePayload }>("/api/arcade/chat", {
        method: "POST",
        body: { channel, text: trimmed },
      });
      setMessages((m) => [...m.filter((x) => x.id !== res.message.id), res.message]);
      setDraft("");
    } catch {
      // keep the draft so they can retry
    } finally {
      setSending(false);
    }
  };

  const quips = isPlayer ? PLAYER_QUIPS : CROWD_QUIPS;

  return (
    <div className="brutal-card p-3">
      <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink/60">
        {isPlayer ? "Smack talk" : "Crowd chat"}
      </p>

      <div
        ref={listRef}
        className="mb-2 max-h-48 min-h-[5rem] space-y-1.5 overflow-y-auto border-2 border-ink bg-paper p-2"
      >
        {messages.length === 0 ? (
          <p className="font-mono text-xs text-ink/40">
            Nothing yet. Someone talk some trash.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex items-start gap-1.5">
              <Avatar name={m.user.displayName} src={m.user.avatarUrl} size="sm" />
              <p className="min-w-0 flex-1 text-sm leading-snug">
                <span
                  className={`font-display font-bold ${
                    m.user.id === meId ? "text-accent-blue" : ""
                  }`}
                >
                  {m.user.displayName}
                </span>{" "}
                <span className="break-words">{m.text}</span>
              </p>
            </div>
          ))
        )}
      </div>

      {/* canned quips */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {quips.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            disabled={sending}
            className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-[11px] shadow-brutal-sm disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          placeholder={isPlayer ? "Talk your talk…" : "Heckle from the stands…"}
          className="brutal-input flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="brutal-press border-2 border-ink bg-accent-orange px-3 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
