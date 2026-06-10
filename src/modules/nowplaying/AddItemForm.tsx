"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button, Input } from "@/components/ui";
import { useCloseModuleForm } from "@/components/ModuleHeader";
import { PixelIcon, type IconName } from "@/components/icons";

const TYPES = [
  { value: "show", label: "Show", icon: "tv" },
  { value: "movie", label: "Movie", icon: "clapperboard" },
  { value: "book", label: "Book", icon: "book-open" },
] as const satisfies readonly { value: string; label: string; icon: IconName }[];

type TmdbResult = { id: number; title: string; year: number | null; posterPath: string | null };
type TmdbMeta = { tmdbId: number; posterPath: string | null; releaseYear: number | null };

export function AddItemForm() {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  const [mediaType, setMediaType] = useState<"show" | "movie" | "book">("show");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TMDB search-as-you-type. `meta` is only set by picking a result and
  // cleared on any manual edit, so free-typed titles stay metadata-free.
  const [meta, setMeta] = useState<TmdbMeta | null>(null);
  const [results, setResults] = useState<TmdbResult[]>([]);
  const [open, setOpen] = useState(false);
  // null = unknown until the first response; false = no server key, hide it all.
  const [searchEnabled, setSearchEnabled] = useState<boolean | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const searchable = mediaType !== "book" && searchEnabled !== false;

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = title.trim();
    if (!searchable || meta !== null || q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const mine = ++seq.current;
    debounce.current = setTimeout(async () => {
      try {
        const type = mediaType === "movie" ? "movie" : "tv";
        const res = await api<{ enabled: boolean; results: TmdbResult[] }>(
          `/api/tmdb/search?type=${type}&q=${encodeURIComponent(q)}`
        );
        if (mine !== seq.current) return; // a newer keystroke won
        setSearchEnabled(res.enabled);
        setResults(res.results);
        setOpen(res.results.length > 0);
      } catch {
        // Search is optional sugar; typing keeps working.
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, mediaType, searchable, meta]);

  function pick(r: TmdbResult) {
    seq.current++; // cancel any in-flight search
    setTitle(r.year ? `${r.title} (${r.year})` : r.title);
    setMeta({ tmdbId: r.id, posterPath: r.posterPath, releaseYear: r.year });
    setResults([]);
    setOpen(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/nowplaying", {
        method: "POST",
        body: { mediaType, title, note: note || null, ...(meta ?? {}) },
      });
      setTitle("");
      setNote("");
      setMeta(null);
      router.refresh();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">What are you into right now?</p>
      <div className="flex gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setMediaType(t.value);
              setMeta(null);
            }}
            className={`brutal-press flex-1 border-2 border-ink px-2 py-1.5 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
              mediaType === t.value ? "bg-accent-yellow" : "bg-card"
            }`}
          >
            <PixelIcon name={t.icon} size={13} className="-mt-0.5 mr-1 inline" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setMeta(null);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={searchable ? "Title — search kicks in as you type" : "Title"}
          required
          autoComplete="off"
        />
        {open && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto border-2 border-ink bg-card shadow-brutal">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(r)}
                  className="flex w-full items-center gap-2 border-b border-ink/10 px-2 py-1.5 text-left hover:bg-accent-yellow"
                >
                  {r.posterPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://image.tmdb.org/t/p/w92${r.posterPath}`}
                      alt=""
                      className="h-12 w-8 shrink-0 border border-ink object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-8 shrink-0 items-center justify-center border border-ink bg-paper">
                      <PixelIcon name={mediaType === "movie" ? "clapperboard" : "tv"} size={14} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{r.title}</span>
                    {r.year && (
                      <span className="font-mono text-[10px] uppercase text-ink/50">{r.year}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {meta && (
        <p className="font-mono text-[10px] uppercase text-ink/50">
          <PixelIcon name="check" size={12} className="-mt-0.5 mr-1 inline" />
          Poster attached from TMDB
        </p>
      )}
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="One-line take (optional)"
        maxLength={500}
      />
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" variant="yellow" disabled={busy} className="w-full">
        {busy ? "Adding…" : "Add to my board"}
      </Button>
    </form>
  );
}
