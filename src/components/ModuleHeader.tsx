"use client";

import { useState, type ReactNode } from "react";
import { PixelIcon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui";

/**
 * Module page header with the create-action behind a top-level button:
 * content shows first, the form (children) expands on demand. The
 * Cookbook pattern, for modules whose form lives on the same page.
 */
export function ModuleHeader({
  title,
  icon,
  accentBg,
  addLabel,
  extra,
  children,
}: {
  title: string;
  icon: IconName;
  accentBg: string;
  /** Label for the toggle, e.g. "Poll" renders "+ Poll". */
  addLabel: string;
  /** Optional extra header action (links, filters) next to the button. */
  extra?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1
          className={`tilt-l inline-flex items-center gap-2.5 border-3 border-ink px-4 py-1 text-3xl shadow-brutal ${accentBg}`}
        >
          <PixelIcon name={icon} size={26} />
          {title}
        </h1>
        <div className="flex items-center gap-2">
          {extra}
          <Button variant={open ? "ghost" : "yellow"} onClick={() => setOpen((v) => !v)}>
            {open ? "× Close" : `+ ${addLabel}`}
          </Button>
        </div>
      </div>
      {open && <div className="mb-6">{children}</div>}
    </>
  );
}
