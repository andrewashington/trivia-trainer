"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { worldBridge } from "./bridge";

const WORLD_MUSIC_MUTED_KEY = "udmplus-world-music-muted";
const CHAT_MAX_CHARS = 180;

type WorldChatMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  at: number;
  mine?: boolean;
};

function readInitialMusicMuted() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(WORLD_MUSIC_MUTED_KEY) === "1";
}

/** Lazy-loaded so the Phaser import only runs on the client. */
export function WorldGame({ characterPath }: { characterPath: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [musicMuted, setMusicMuted] = useState(readInitialMusicMuted);

  useEffect(() => {
    if (!containerRef.current) return;

    let game: import("phaser").Game | null = null;
    const initialMusicMuted = readInitialMusicMuted();

    // Dynamic import keeps Phaser out of the SSR bundle.
    (async () => {
      const Phaser = (await import("phaser")).default;
      const { WorldScene } = await import("./WorldScene");

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current!,
        width: "100%",
        height: "100%",
        pixelArt: true,
        roundPixels: true,
        backgroundColor: "#1a1a1a",
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        physics: {
          default: "arcade",
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false,
          },
        },
      });
      game.scene.add("WorldScene", WorldScene, true, {
        characterPath,
        musicMuted: initialMusicMuted,
      });
    })();

    return () => {
      game?.destroy(true);
    };
  }, [characterPath]);

  const toggleMusicMuted = () => {
    setMusicMuted((current) => {
      const next = !current;
      window.localStorage.setItem(WORLD_MUSIC_MUTED_KEY, next ? "1" : "0");
      worldBridge.emit("music-muted", { muted: next });
      return next;
    });
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        style={{ width: "100%", height: "calc(100vh - 160px)", minHeight: 320 }}
        className="overflow-hidden border-3 border-ink shadow-brutal"
      />
      <button
        type="button"
        onClick={toggleMusicMuted}
        aria-pressed={musicMuted}
        aria-label={musicMuted ? "Unmute world music" : "Mute world music"}
        className="absolute right-3 top-3 z-10 border-3 border-ink bg-card px-3 py-2 font-mono text-xs font-black uppercase text-ink shadow-brutal transition hover:-translate-y-0.5 hover:bg-yellow focus:outline-none focus:ring-4 focus:ring-yellow/50"
      >
        {musicMuted ? "Music Off" : "Music On"}
      </button>
      <WorldChat />
    </div>
  );
}

function WorldChat() {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<WorldChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const openRef = useRef(open);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openRef.current = open;
    if (open) {
      setUnread(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      worldBridge.emit("chat-focus", { focused: false });
    }
  }, [open]);

  useEffect(
    () =>
      worldBridge.on("chat-message", (message) => {
        setMessages((current) => [...current, message].slice(-60));
        if (!openRef.current) setUnread((current) => current + 1);
      }),
    []
  );

  useEffect(
    () =>
      worldBridge.on("chat-status", ({ available }) => {
        setAvailable(available);
      }),
    []
  );

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (available !== true) return;
    const text = draft.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_CHARS);
    if (!text) return;
    worldBridge.emit("chat-send", { text });
    setDraft("");
  };

  const latest = messages[messages.length - 1];
  const statusText =
    available === null ? "connecting" : available ? "live" : "offline";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 border-3 border-ink bg-card px-3 py-2 text-left font-mono text-xs shadow-brutal transition hover:-translate-y-0.5 hover:bg-yellow focus:outline-none focus:ring-4 focus:ring-yellow/50 sm:max-w-sm"
        aria-label={unread > 0 ? `Open world chat, ${unread} unread` : "Open world chat"}
      >
        <span className="font-black uppercase text-ink">Chat</span>
        <span
          className={`h-2.5 w-2.5 border-2 border-ink ${
            available === true ? "bg-accent-meadow" : "bg-ink/20"
          }`}
          aria-hidden="true"
        />
        {latest && (
          <span className="truncate text-ink/60">
            {latest.mine ? "You" : latest.name}: {latest.text}
          </span>
        )}
        {unread > 0 && (
          <span className="ml-auto border-2 border-ink bg-accent-yellow px-1.5 font-black text-ink">
            {unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <section className="absolute bottom-3 left-3 z-10 w-[min(24rem,calc(100%-1.5rem))] border-3 border-ink bg-card shadow-brutal">
      <div className="flex items-center justify-between border-b-3 border-ink bg-accent-yellow px-3 py-2">
        <div>
          <h2 className="font-display text-sm font-black uppercase leading-none">
            World Chat
          </h2>
          <p className="mt-1 font-mono text-[10px] font-bold uppercase text-ink/60">
            {statusText} / press T to chat
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="border-2 border-ink bg-card px-2 py-1 font-mono text-xs font-black uppercase shadow-brutal-sm"
          aria-label="Close world chat"
        >
          Close
        </button>
      </div>

      <div
        ref={listRef}
        className="max-h-52 space-y-2 overflow-y-auto px-3 py-3 font-mono text-xs"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="border-2 border-dashed border-ink/30 bg-white/50 p-3 text-ink/55">
            Say hi to anyone walking this map. Short messages work best here.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[92%] border-2 border-ink px-2 py-1.5 shadow-brutal-sm ${
                message.mine ? "ml-auto bg-accent-yellow" : "bg-white"
              }`}
            >
              <div className="mb-0.5 flex items-center gap-2 text-[10px] font-black uppercase text-ink/55">
                <span className="truncate">{message.mine ? "You" : message.name}</span>
                <span className="shrink-0">{formatChatTime(message.at)}</span>
              </div>
              <p className="break-words leading-snug text-ink">{message.text}</p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t-3 border-ink p-2">
        <input
          ref={inputRef}
          value={draft}
          maxLength={CHAT_MAX_CHARS}
          disabled={available !== true}
          onFocus={() => worldBridge.emit("chat-focus", { focused: true })}
          onBlur={() => worldBridge.emit("chat-focus", { focused: false })}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder={
            available === false ? "Chat needs the world socket" : "Message the room"
          }
          className="min-w-0 flex-1 border-2 border-ink bg-white px-2 py-2 font-mono text-xs font-bold text-ink outline-none disabled:bg-ink/10 disabled:text-ink/40"
        />
        <button
          type="submit"
          disabled={available !== true || draft.trim().length === 0}
          className="border-2 border-ink bg-ink px-3 py-2 font-mono text-xs font-black uppercase text-white shadow-brutal-sm disabled:cursor-not-allowed disabled:bg-ink/25"
        >
          Send
        </button>
      </form>
    </section>
  );
}

function formatChatTime(at: number) {
  return new Date(at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
