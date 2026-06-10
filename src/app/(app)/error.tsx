"use client";

import { useEffect } from "react";

/**
 * In-app error boundary: catches render/runtime errors in any module
 * page, shows a friendly brutalist screen, and logs to the browser
 * console (and the server, via Next's error reporting). The `digest`
 * is a stable id you can cross-reference with server logs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[UDM+ error]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="brutal-card tilt-l p-8">
        <p className="font-display text-6xl font-bold">×_×</p>
        <h1 className="mt-4 font-display text-2xl font-bold">Well, that broke.</h1>
        <p className="mt-2 text-sm text-ink/60">
          Something went sideways rendering this page. It&apos;s not you — it&apos;s us.
        </p>
        {error.digest && (
          <p className="mt-3 inline-block border-2 border-ink bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink/60">
            ref: {error.digest}
          </p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={reset}
            className="brutal-press border-3 border-ink bg-accent-blue px-4 py-2 font-display font-bold uppercase tracking-wide text-white shadow-brutal"
          >
            Try again
          </button>
          <a
            href="/"
            className="brutal-press border-3 border-ink bg-card px-4 py-2 font-display font-bold uppercase tracking-wide no-underline shadow-brutal"
          >
            Go home
          </a>
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-wide text-ink/40">
          Hit the Feedback button to tell us what you were doing.
        </p>
      </div>
    </div>
  );
}
