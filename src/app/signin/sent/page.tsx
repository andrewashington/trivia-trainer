import { Logo } from "@/components/Logo";

export const metadata = { title: "Check your email" };

export default function SentPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <Logo size="md" />
      <div className="brutal-card tilt-l w-full max-w-sm p-8 text-center">
        <div className="text-5xl">📬</div>
        <h1 className="mt-4 text-2xl">Check your email</h1>
        <p className="mt-2 text-sm text-ink/60">
          If your address is on the list, a magic link is waiting for you.
          It expires in 15 minutes.
        </p>
      </div>
    </div>
  );
}
