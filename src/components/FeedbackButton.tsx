"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { PixelIcon, type IconName } from "@/components/icons";

type Kind = "bug" | "idea" | "praise";

const KINDS: { key: Kind; label: string; icon: IconName; bg: string }[] = [
  { key: "bug", label: "Bug", icon: "bug", bg: "bg-accent-red text-white" },
  { key: "idea", label: "Idea", icon: "lightbulb", bg: "bg-accent-lime" },
  { key: "praise", label: "Love it", icon: "heart", bg: "bg-accent-pink" },
];

/**
 * Always-available feedback channel for testers: a floating button that
 * opens a tiny form. Captures the current path + user agent so reports
 * are actionable without back-and-forth. Lands on the Admin page.
 */
export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("bug");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/feedback", {
        method: "POST",
        body: { kind, message: message.trim(), path: pathname },
      });
      setSent(true);
      setMessage("");
      setTimeout(() => {
        setOpen(false);
        setSent(false);
        setKind("bug");
      }, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Send feedback"
        aria-label="Send feedback"
        className="brutal-press fixed bottom-20 left-4 z-[1000] flex h-10 items-center gap-1.5 border-3 border-ink bg-accent-yellow px-3 font-display text-sm font-bold uppercase shadow-brutal md:bottom-6 md:left-6"
      >
        <PixelIcon name="megaphone" size={16} />
        Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-[1250] flex items-end justify-center overflow-y-auto bg-ink/50 p-4 sm:items-center">
          <div className="brutal-card w-full max-w-md p-5">
            {sent ? (
              <div className="py-6 text-center">
                <PixelIcon name="heart" size={40} className="mx-auto text-accent-pink" />
                <p className="mt-3 font-display text-xl font-bold">Got it — thank you!</p>
                <p className="mt-1 text-sm text-ink/60">
                  It went straight to the group&apos;s admin.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-bold">What&apos;s up?</h2>
                  <button onClick={() => setOpen(false)} aria-label="Close">
                    <PixelIcon name="close" size={18} />
                  </button>
                </div>

                <div className="mt-3 flex gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.key}
                      type="button"
                      onClick={() => setKind(k.key)}
                      className={`brutal-press flex flex-1 items-center justify-center gap-1.5 border-2 border-ink px-2 py-2 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
                        kind === k.key ? k.bg : "bg-card"
                      }`}
                    >
                      <PixelIcon name={k.icon} size={14} />
                      {k.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    kind === "bug"
                      ? "What broke? What did you expect to happen?"
                      : kind === "idea"
                        ? "What would make this better?"
                        : "Tell us what you love!"
                  }
                  maxLength={4000}
                  rows={4}
                  autoFocus
                  className="brutal-input mt-3 min-h-28"
                />

                <p className="mt-1 font-mono text-[10px] uppercase text-ink/40">
                  Sent from {pathname}
                </p>

                {error && (
                  <p className="mt-2 border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
                    {error}
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  <Button onClick={send} disabled={busy || !message.trim()} className="flex-1">
                    {busy ? "Sending…" : "Send it"}
                  </Button>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
