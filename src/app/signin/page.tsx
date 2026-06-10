import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { SignInDecor } from "@/components/SignInDecor";
import { SignInForm } from "@/components/SignInForm";

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
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-7 overflow-hidden px-4">
      <SignInDecor />

      <div className="relative z-10 flex flex-col items-center gap-7">
        <Logo size="xl" animated />
        <p className="animate-pop-in font-mono text-sm uppercase tracking-widest text-ink/60 [animation-delay:900ms]">
          Friends only · No algorithm · No ads
        </p>
        <SignInForm action={requestLink} />
      </div>
    </div>
  );
}
