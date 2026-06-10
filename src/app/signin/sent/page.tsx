import { Logo } from "@/components/Logo";
import { SignInDecor } from "@/components/SignInDecor";
import { PixelIcon } from "@/components/icons";

export const metadata = { title: "Check your email" };

export default function SentPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-4">
      <SignInDecor />
      <div className="relative z-10 flex flex-col items-center gap-8">
        <Logo size="md" animated />
        <div className="brutal-card tilt-l w-full max-w-sm animate-pop-in p-8 text-center">
          <div className="flex justify-center">
            <span className="flex h-20 w-20 animate-hop items-center justify-center border-3 border-ink bg-accent-yellow shadow-brutal">
              <PixelIcon name="mail" size={44} />
            </span>
          </div>
          <h1 className="mt-5 text-2xl">Check your email!</h1>
          <p className="mt-2 text-sm text-ink/60">
            If your address is on the list, a magic link is winging its way to
            you. It expires in 15 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
