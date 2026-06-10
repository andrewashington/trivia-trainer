"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PixelIcon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui";

/**
 * Lets a form rendered inside the ModuleHeader modal close it after a
 * successful submit, without prop-drilling through server components.
 */
const CloseFormContext = createContext<() => void>(() => {});
export function useCloseModuleForm() {
  return useContext(CloseFormContext);
}

/**
 * Exposes the same close-form context to other modal hosts (the global
 * command launcher), so create forms work unmodified in either modal.
 */
export function CloseFormProvider({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return <CloseFormContext.Provider value={onClose}>{children}</CloseFormContext.Provider>;
}

/**
 * Module page header. The create form (children) opens in a modal so
 * the contribution gets room to breathe instead of squeezing between
 * the header and the feed.
 */
export function ModuleHeader({
  title,
  icon,
  accentBg,
  addLabel,
  tagline,
  extra,
  children,
}: {
  title: string;
  icon: IconName;
  accentBg: string;
  /** Label for the toggle, e.g. "Poll" renders "+ Poll". */
  addLabel: string;
  /** Always-visible verb phrase: what this module is FOR. */
  tagline?: string;
  /** Optional extra header action (links, filters) next to the button. */
  extra?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className={`tilt-l inline-flex items-center gap-2.5 border-3 border-ink px-4 py-1 text-3xl shadow-brutal ${accentBg}`}
          >
            <PixelIcon name={icon} size={26} />
            {title}
          </h1>
          {tagline && (
            <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-widest text-ink/50">
              {tagline}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {extra}
          <Button variant="yellow" onClick={() => setOpen(true)}>
            + {addLabel}
          </Button>
        </div>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 pt-12 sm:pt-20"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="brutal-card w-full max-w-lg bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="brutal-label !mb-0 flex items-center gap-1.5">
                <PixelIcon name={icon} size={14} /> New {addLabel.toLowerCase()}
              </p>
              <button
                onClick={() => setOpen(false)}
                className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <CloseFormContext.Provider value={() => setOpen(false)}>
              {children}
            </CloseFormContext.Provider>
          </div>
        </div>
      )}
    </>
  );
}
