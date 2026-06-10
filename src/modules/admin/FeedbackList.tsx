"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Badge } from "@/components/ui";
import { PixelIcon, type IconName } from "@/components/icons";

export type FeedbackContext = {
  viewport?: string;
  screen?: string;
  dpr?: number;
  locale?: string;
  timezone?: string;
  referrer?: string;
};

export type FeedbackItem = {
  id: string;
  kind: "bug" | "idea" | "praise";
  severity: "low" | "medium" | "high";
  message: string;
  path: string;
  userAgent: string | null;
  context: FeedbackContext | null;
  resolvedAt: string | null;
  createdAt: string;
  userName: string;
};

const KIND_META: Record<FeedbackItem["kind"], { label: string; icon: IconName; bg: string }> = {
  bug: { label: "Bug", icon: "bug", bg: "bg-accent-red text-white" },
  idea: { label: "Idea", icon: "lightbulb", bg: "bg-accent-lime" },
  praise: { label: "Love", icon: "heart", bg: "bg-accent-pink" },
};

const SEVERITY_META: Record<FeedbackItem["severity"], { label: string; bg: string }> = {
  low: { label: "Minor", bg: "bg-accent-yellow" },
  medium: { label: "Annoying", bg: "bg-accent-orange" },
  high: { label: "Broken", bg: "bg-accent-red text-white" },
};

/** Build an agent-ready triage prompt from one item — mirrors the export script. */
function asPrompt(item: FeedbackItem): string {
  const ctx = item.context ?? {};
  const lines = [
    `# ${item.kind === "bug" ? "Bug" : item.kind === "idea" ? "Idea" : "Praise"}: ${item.message.split("\n")[0].slice(0, 80)}`,
    "",
    `- **Kind:** ${item.kind}${item.kind === "bug" ? ` (severity: ${item.severity})` : ""}`,
    `- **Reported by:** ${item.userName} on ${new Date(item.createdAt).toLocaleString()}`,
    `- **Page:** \`${item.path || "—"}\``,
    ctx.viewport ? `- **Viewport:** ${ctx.viewport} (screen ${ctx.screen ?? "?"}, dpr ${ctx.dpr ?? "?"})` : "",
    ctx.locale || ctx.timezone ? `- **Locale/TZ:** ${ctx.locale ?? "?"} / ${ctx.timezone ?? "?"}` : "",
    item.userAgent ? `- **User agent:** ${item.userAgent}` : "",
    "",
    "## Report",
    item.message,
    "",
    "## Task",
    item.kind === "bug"
      ? "Reproduce the issue on the page above, find the root cause, and propose a fix. Do not change unrelated behavior."
      : "Evaluate this and propose how to implement it (or why not).",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

export function FeedbackList({ items }: { items: FeedbackItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function copyPrompt(item: FeedbackItem) {
    try {
      await navigator.clipboard.writeText(asPrompt(item));
      setCopied(item.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      alert("Couldn't copy — clipboard blocked.");
    }
  }

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const toggle = (item: FeedbackItem) =>
    act(item.id, () =>
      api(`/api/feedback/${item.id}`, {
        method: "PATCH",
        body: { resolved: !item.resolvedAt },
      })
    );
  const remove = (id: string) =>
    act(id, () => api(`/api/feedback/${id}`, { method: "DELETE" }));

  const openCount = items.filter((i) => !i.resolvedAt).length;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
        <PixelIcon name="megaphone" size={18} />
        Feedback
        {openCount > 0 && <Badge className="bg-accent-yellow">{openCount} open</Badge>}
      </h2>

      {items.length === 0 ? (
        <p className="brutal-card p-4 text-sm text-ink/50">
          No feedback yet. The Feedback button (bottom-left) lands here.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const meta = KIND_META[item.kind];
            return (
              <li
                key={item.id}
                className={`brutal-card p-3 ${item.resolvedAt ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge className={`inline-flex items-center gap-1.5 ${meta.bg}`}>
                    <PixelIcon name={meta.icon} size={12} /> {meta.label}
                  </Badge>
                  {item.kind === "bug" && (
                    <Badge className={SEVERITY_META[item.severity].bg}>
                      {SEVERITY_META[item.severity].label}
                    </Badge>
                  )}
                  {item.resolvedAt && <Badge className="bg-accent-green">Resolved</Badge>}
                  <span className="font-mono text-[10px] uppercase text-ink/50">
                    {item.userName} · {new Date(item.createdAt).toLocaleDateString()} ·{" "}
                    {item.path || "—"}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{item.message}</p>
                {item.context?.viewport && (
                  <p className="mt-1 font-mono text-[10px] uppercase text-ink/40">
                    {item.context.viewport}
                    {item.context.timezone ? ` · ${item.context.timezone}` : ""}
                    {item.context.locale ? ` · ${item.context.locale}` : ""}
                  </p>
                )}
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => copyPrompt(item)}
                    disabled={busy === item.id}
                    className="brutal-press border-2 border-ink bg-accent-grape px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white shadow-brutal-sm"
                  >
                    {copied === item.id ? "✓ Copied" : "Copy as prompt"}
                  </button>
                  <button
                    onClick={() => toggle(item)}
                    disabled={busy === item.id}
                    className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm"
                  >
                    {item.resolvedAt ? "↺ Reopen" : "✓ Resolve"}
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    disabled={busy === item.id}
                    className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
