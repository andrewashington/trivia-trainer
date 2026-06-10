import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SignInDecor } from "@/components/SignInDecor";
import { PixelIcon } from "@/components/icons";

export const metadata = { title: "Sign-in problem" };

export default function SignInErrorPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-4">
      <SignInDecor />
      <div className="relative z-10 flex flex-col items-center gap-8">
        <Logo size="md" animated />
        <div className="brutal-card tilt-r w-full max-w-sm animate-pop-in p-8 text-center">
        <div className="flex justify-center text-ink/70">
          <PixelIcon name="warning-diamond" size={48} />
        </div>
        <h1 className="mt-4 text-2xl">That link didn&apos;t work</h1>
        <p className="mt-2 text-sm text-ink/60">
          It may have expired, been used already, or your email isn&apos;t on
          the member list. Ask the admin if you think you should be in.
        </p>
        <Link
          href="/signin"
          className="brutal-press mt-6 inline-block border-3 border-ink bg-accent-yellow px-4 py-2 font-display font-bold uppercase no-underline shadow-brutal"
        >
          Try again
        </Link>
        </div>
      </div>
    </div>
  );
}
