import { Suspense } from "react";
import Link from "next/link";
import { PixelIcon } from "@/components/icons";
import { RunClient } from "@/modules/type/RunClient";

export const metadata = { title: "Type · Run" };
export const dynamic = "force-dynamic";

export default function TypeRunPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/type"
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink/50 no-underline"
      >
        <PixelIcon name="chevron-right" size={12} className="rotate-180" />
        Type
      </Link>
      <Suspense fallback={<p className="font-mono text-sm text-ink/50">Loading…</p>}>
        <RunClient />
      </Suspense>
    </div>
  );
}
