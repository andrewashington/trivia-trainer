import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { unreadCounts } from "@/lib/unread";
import { Logo } from "@/components/Logo";
import { AppDecor } from "@/components/AppDecor";
import { MobileNav, SideNav } from "@/components/NavTabs";
import { ModuleIntro } from "@/components/ModuleIntro";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { SeenTracker } from "@/components/SeenTracker";
import { UserMenu } from "@/components/UserMenu";
import { CoinBadge } from "@/components/CoinBadge";
import { PresenceBadge } from "@/components/PresenceBadge";
import { CommandButton } from "@/components/command/CommandButton";
import { FeedbackButton } from "@/components/FeedbackButton";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  const isAdmin = user.role === "admin";
  const counts = await unreadCounts(user);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl">
      {/* Ambient floating shapes in the side gutters — mounted here so
          they persist (and keep bobbing) across page navigations. */}
      <AppDecor />

      {/* Desktop: persistent sidebar owns the nav (and the logo). */}
      <SideNav isAdmin={isAdmin} counts={counts} />

      <div className="flex min-w-0 flex-1 flex-col px-3 pb-24 pt-4 sm:px-6 md:pb-8">
        <header className="mb-6 flex items-center justify-between md:justify-end">
          <Link href="/" className="no-underline md:hidden">
            <Logo size="md" />
          </Link>
          <div className="flex items-center gap-2 md:gap-3">
            <PresenceBadge />
            <CoinBadge initialCoins={user.coins} />
            <CommandButton />
            <UserMenu
              name={user.displayName}
              avatarUrl={user.avatarUrl}
              isAdmin={isAdmin}
              signOutAction={doSignOut}
            />
          </div>
        </header>

        <main className="flex-1">
          {user.onboardedAt && <ModuleIntro introsSeen={user.introsSeen} />}
          {children}
        </main>
      </div>

      {/* First login: the welcome wizard until it's completed. */}
      {!user.onboardedAt && (
        <OnboardingWizard userId={user.id} initialName={user.displayName} />
      )}

      {/* Mobile: Home + four category tabs, thumb-reachable. */}
      <MobileNav isAdmin={isAdmin} counts={counts} />

      {/* Marks a module seen on arrival, clearing its unread badge. */}
      <SeenTracker />

      {/* Always-on feedback channel for testers. */}
      <FeedbackButton />
    </div>
  );
}
