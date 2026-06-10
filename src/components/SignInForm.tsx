"use client";

import { useFormStatus } from "react-dom";
import { PixelIcon } from "@/components/icons";

/**
 * The sign-in card. Kept client-side purely for the submit animation:
 * while the server action is in flight, the CTA flips into a "conjuring
 * your link" state with spinning sparkles and a pulsing shadow. The
 * server action (passed in from the page) does the real work.
 */
export function SignInForm({ action }: { action: (formData: FormData) => void }) {
  return (
    <form
      action={action}
      className="brutal-card w-full max-w-sm animate-pop-in space-y-4 p-6"
    >
      <label className="block">
        <span className="brutal-label">Your email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="brutal-input text-lg focus:animate-flash"
        />
      </label>
      <SubmitButton />
      <p className="text-center text-xs text-ink/50">
        If you&apos;re on the list, a sign-in link is on its way.
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`brutal-press relative w-full overflow-hidden border-3 border-ink px-4 py-3 font-display font-bold uppercase tracking-wide text-white shadow-brutal transition-colors hover:-translate-y-0.5 hover:shadow-brutal-lg ${
        pending ? "animate-pulse-ring bg-accent-grape" : "bg-accent-blue"
      }`}
    >
      {/* Light sweep — only when idle. */}
      {!pending && (
        <span className="absolute inset-y-0 left-0 w-1/3 animate-sheen bg-white/30" />
      )}
      <span className="relative flex items-center justify-center gap-2">
        <PixelIcon
          name={pending ? "loader" : "sparkles"}
          size={16}
          className={pending ? "animate-spin" : "animate-sparkle"}
        />
        {pending ? "Conjuring your link…" : "Send magic link"}
        {!pending && <PixelIcon name="sparkles" size={16} className="animate-sparkle" />}
        {!pending && <span aria-hidden>→</span>}
      </span>
    </button>
  );
}
