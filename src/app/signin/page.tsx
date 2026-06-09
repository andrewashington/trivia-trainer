import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  const user = await currentUser();
  if (user) redirect("/");

  async function requestLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email) redirect("/signin");
    try {
      await signIn("email", { email, redirect: false });
    } catch {
      // Fall through: we always show the same "check your email" screen
      // so a probe can't learn whether an address is on the allowlist.
    }
    redirect("/signin/sent");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <Logo size="xl" />
      <p className="font-mono text-sm uppercase tracking-widest text-ink/60">
        Friends only · No passwords
      </p>
      <form
        action={requestLink}
        className="brutal-card w-full max-w-sm space-y-4 p-6"
      >
        <label className="block">
          <span className="brutal-label">Your email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="brutal-input"
          />
        </label>
        <button
          type="submit"
          className="brutal-press w-full border-3 border-ink bg-accent-blue px-4 py-3 font-display font-bold uppercase tracking-wide text-white shadow-brutal"
        >
          Send magic link →
        </button>
        <p className="text-center text-xs text-ink/50">
          If you&apos;re on the list, a sign-in link is on its way.
        </p>
      </form>
    </div>
  );
}
