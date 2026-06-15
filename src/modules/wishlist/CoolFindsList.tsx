"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Badge, Card, EmptyState } from "@/components/ui";
import { COOL_FIND_CATEGORIES } from "@/modules/wishlist/schema";

export type CoolFindView = {
  id: string;
  title: string;
  url: string;
  category: string;
  note: string | null;
  imageUrl: string | null;
  siteName: string | null;
  user: { id: string; displayName: string; avatarUrl: string | null };
};

export type Viewer = { id: string; isAdmin: boolean };

const CATEGORY_TINT: Record<string, string> = {
  tools: "bg-accent-blue text-white",
  funny: "bg-accent-yellow",
  interesting: "bg-accent-green",
  other: "bg-paper",
};

export function CoolFindsList({ finds, viewer }: { finds: CoolFindView[]; viewer: Viewer }) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const shown = filter === "all" ? finds : finds.filter((f) => f.category === filter);

  async function remove(id: string) {
    setBusy(id);
    try {
      await api(`/api/wishlist/finds/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2">
        {["all", ...COOL_FIND_CATEGORIES].map((c) => {
          const active = filter === c;
          const count = c === "all" ? finds.length : finds.filter((f) => f.category === c).length;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={`inline-flex items-center gap-1.5 border-3 border-ink px-3 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
                active ? CATEGORY_TINT[c] ?? "bg-ink text-white" : "bg-card"
              }`}
            >
              {c}
              <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="lightbulb"
          title="No cool finds yet"
          hint="Found a great tool, a cursed video, a useful site? Drop the link."
        />
      ) : (
        <Card>
          <ul className="space-y-3">
            {shown.map((f) => (
              <li key={f.id} className="flex items-start gap-3">
                {f.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.imageUrl} alt="" className="h-14 w-14 shrink-0 border-2 border-ink object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-snug">
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink hover:text-accent-blue"
                    >
                      {f.title} ↗
                    </a>
                  </p>
                  <p className="mt-0.5 flex items-center gap-2">
                    <Badge className={CATEGORY_TINT[f.category] ?? "bg-paper"}>{f.category}</Badge>
                    {f.siteName && <span className="font-mono text-[10px] uppercase text-ink/40">{f.siteName}</span>}
                  </p>
                  {f.note && <p className="mt-0.5 text-sm italic text-ink/60">{f.note}</p>}
                  <p className="mt-1 font-mono text-[10px] uppercase text-ink/40">
                    by{" "}
                    <Link href={`/people/${f.user.id}`} className="text-ink/40 no-underline hover:text-accent-blue">
                      {f.user.displayName}
                    </Link>
                  </p>
                </div>
                {(f.user.id === viewer.id || viewer.isAdmin) && (
                  <button
                    onClick={() => remove(f.id)}
                    disabled={busy === f.id}
                    className="brutal-press shrink-0 border-2 border-ink bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold shadow-brutal-sm"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
