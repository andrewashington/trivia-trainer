import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card } from "@/components/ui";
import { ProfileForm } from "@/components/ProfileForm";

export const metadata = { title: "You" };

export default async function MePage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Avatar name={user.displayName} />
          <div>
            <p className="font-display text-xl font-bold">{user.displayName}</p>
            <p className="text-sm text-ink/60">{user.email}</p>
          </div>
        </div>
        <div className="mt-4">
          <Badge className={user.role === "admin" ? "bg-accent-grape text-white" : "bg-paper"}>
            {user.role}
          </Badge>
        </div>
      </Card>
      <ProfileForm
        initialName={user.displayName}
        initialVenmo={user.venmoHandle ? `@${user.venmoHandle}` : ""}
      />
      <form action={doSignOut}>
        <button
          type="submit"
          className="brutal-press w-full border-3 border-ink bg-card px-4 py-3 font-display font-bold uppercase tracking-wide shadow-brutal"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
