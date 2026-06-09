import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/ui";
import { NavTabs } from "@/components/NavTabs";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-3 pb-24 pt-4 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="no-underline">
          <Logo size="md" />
        </Link>
        <Link
          href={user.role === "admin" ? "/admin" : "/me"}
          className="no-underline"
          title={user.role === "admin" ? "Admin" : "Your profile"}
        >
          <Avatar name={user.displayName} />
        </Link>
      </header>

      <main className="flex-1">{children}</main>

      {/* Bottom tab bar: thumb-reachable, one-handed phone use. */}
      <NavTabs isAdmin={user.role === "admin"} />
    </div>
  );
}
