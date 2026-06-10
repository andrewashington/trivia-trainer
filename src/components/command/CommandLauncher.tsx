"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { modules } from "@/modules/registry";
import { PixelIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { CloseFormProvider } from "@/components/ModuleHeader";
import { AddPollForm } from "@/modules/polls/AddPollForm";
import { AddListingForm } from "@/modules/marketplace/AddListingForm";
import { UploadForm } from "@/modules/files/UploadForm";
import { AddWishForm } from "@/modules/wishlist/AddWishForm";
import { AddIdeaForm } from "@/modules/ideas/AddIdeaForm";
import { AddEntryForm } from "@/modules/vault/AddEntryForm";
import { ClaimForm } from "@/modules/stakes/ClaimForm";
import { AddPromptForm } from "@/modules/reveal/AddPromptForm";
import { AddItemForm } from "@/modules/nowplaying/AddItemForm";
import { AddCountdownForm } from "@/modules/countdowns/AddCountdownForm";

/** Home-page CTA (or anything else) can open the launcher via this event. */
export const OPEN_LAUNCHER_EVENT = "udm:open-launcher";

const MOD = Object.fromEntries(modules.map((m) => [m.key, m]));
const DARK_ACCENTS = new Set([
  "bg-accent-blue",
  "bg-accent-forest",
  "bg-accent-indigo",
  "bg-accent-magenta",
  "bg-accent-punch",
  "bg-ink",
]);
const onAccent = (bg: string) => (DARK_ACCENTS.has(bg) ? "text-white" : "text-ink");

export type LauncherProps = {
  members: { id: string; name: string }[];
  memberNames: string[];
  hasVenmo: boolean;
  maxMb: number;
};

type Creatable = {
  key: string;
  /** What you're making, e.g. "poll" — renders "New poll" in step 2. */
  noun: string;
  /** Verb phrase shown under the module name in the picker. */
  desc: string;
  /** Full-page create flows link out instead of rendering a form. */
  linkTo?: string;
  form?: (p: LauncherProps) => ReactNode;
};

// Picker order roughly mirrors the old home quick actions. Events and
// cookbook have full-page create flows, so they navigate instead of
// rendering a form. Map/pet/snake/contacts have no single "create" act.
const CREATABLES: Creatable[] = [
  { key: "events", noun: "event", desc: "Plan an event", linkTo: "/events/new" },
  { key: "cookbook", noun: "recipe", desc: "Add a recipe", linkTo: "/cookbook/new" },
  { key: "polls", noun: "poll", desc: "Ask a poll", form: () => <AddPollForm /> },
  { key: "stakes", noun: "claim", desc: "Make a claim", form: (p) => <ClaimForm members={p.members} /> },
  { key: "ideas", noun: "idea", desc: "Pitch an idea", form: () => <AddIdeaForm /> },
  { key: "marketplace", noun: "listing", desc: "List something", form: (p) => <AddListingForm hasVenmo={p.hasVenmo} /> },
  { key: "reveal", noun: "reveal", desc: "Start a reveal", form: (p) => <AddPromptForm memberNames={p.memberNames} /> },
  { key: "wishlist", noun: "wish", desc: "Add a wish", form: () => <AddWishForm /> },
  { key: "nowplaying", noun: "watch", desc: "Log a watch", form: () => <AddItemForm /> },
  { key: "files", noun: "upload", desc: "Upload a file", form: (p) => <UploadForm maxMb={p.maxMb} /> },
  { key: "vault", noun: "login", desc: "Stash a secret", form: () => <AddEntryForm /> },
  { key: "countdowns", noun: "countdown", desc: "Start a countdown", form: () => <AddCountdownForm /> },
];

export function CommandLauncher(props: LauncherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Creatable | null>(null);

  // Opening always starts fresh at the picker; closing unmounts any form.
  const openLauncher = useCallback(() => {
    setPicked(null);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setPicked(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        const t = e.target as HTMLElement | null;
        if (
          t &&
          (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
        )
          return;
        e.preventDefault();
        if (open) close();
        else openLauncher();
      } else if (e.key === "Escape" && open) {
        close();
      }
    };
    const onOpenEvent = () => openLauncher();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_LAUNCHER_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_LAUNCHER_EVENT, onOpenEvent);
    };
  }, [open, close, openLauncher]);

  function pick(c: Creatable) {
    if (c.linkTo) {
      close();
      router.push(c.linkTo);
      return;
    }
    setPicked(c);
  }

  // After a successful submit: close and land where the new item lives.
  function onCreated(c: Creatable) {
    close();
    router.push(MOD[c.key]?.href ?? "/");
  }

  return (
    <>
      <Button variant="yellow" onClick={openLauncher} className="!px-3 !py-1.5 text-sm">
        + New
        <span className="ml-2 hidden font-mono text-[10px] font-normal opacity-60 sm:inline">
          ⌘K
        </span>
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 pt-12 sm:pt-20"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="brutal-card w-full max-w-lg bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              {picked ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPicked(null)}
                    className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
                  >
                    ← Back
                  </button>
                  <p className="brutal-label !mb-0 flex items-center gap-1.5">
                    <PixelIcon name={MOD[picked.key]?.icon ?? "zap"} size={14} /> New{" "}
                    {picked.noun}
                  </p>
                </div>
              ) : (
                <p className="brutal-label !mb-0 flex items-center gap-1.5">
                  <PixelIcon name="zap" size={14} /> Make something
                </p>
              )}
              <button
                onClick={close}
                className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {picked?.form ? (
              <CloseFormProvider onClose={() => onCreated(picked)}>
                {picked.form(props)}
              </CloseFormProvider>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CREATABLES.map((c) => {
                  const mod = MOD[c.key];
                  if (!mod) return null;
                  return (
                    <button
                      key={c.key}
                      onClick={() => pick(c)}
                      className={`brutal-press flex flex-col items-start gap-1 border-2 border-ink p-3 text-left shadow-brutal-sm ${mod.accentBg} ${onAccent(mod.accentBg)}`}
                    >
                      <PixelIcon name={mod.icon} size={20} />
                      <span className="font-display text-sm font-bold uppercase tracking-wide">
                        {mod.label}
                      </span>
                      <span className="font-mono text-[10px] uppercase opacity-70">
                        {c.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
