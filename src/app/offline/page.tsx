import { Logo } from "@/components/Logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <Logo size="md" />
      <div className="brutal-card tilt-l w-full max-w-sm p-8 text-center">
        <div className="text-5xl">📡</div>
        <h1 className="mt-4 text-2xl">You&apos;re offline</h1>
        <p className="mt-2 text-sm text-ink/60">
          UDM+ needs the internet for the good stuff. Reconnect and pull to
          refresh.
        </p>
      </div>
    </div>
  );
}
