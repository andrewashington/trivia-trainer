import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { EmptyState } from "@/components/ui";
import { ModuleHeader } from "@/components/ModuleHeader";
import { AddEntryForm } from "@/modules/vault/AddEntryForm";
import { VaultEntryRow } from "@/modules/vault/VaultEntryRow";

export const metadata = { title: "Vault" };
export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const entries = await db.vaultEntry.findMany({
    orderBy: { siteName: "asc" },
    select: {
      id: true,
      siteName: true,
      siteUrl: true,
      username: true,
      notes: true,
      creatorId: true,
      creator: { select: { displayName: true, avatarUrl: true } },
    },
  });

  return (
    <div className="space-y-6">
      <ModuleHeader title="Vault" icon="lock" accentBg="bg-accent-cyan" addLabel="Login">
        <AddEntryForm />
      </ModuleHeader>

      {entries.length === 0 ? (
        <EmptyState
          icon="unlock"
          title="The vault is sealed… and empty"
          hint="Add the shared streaming login everyone keeps texting you for."
        />
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <VaultEntryRow
              key={e.id}
              entry={{
                id: e.id,
                siteName: e.siteName,
                siteUrl: e.siteUrl,
                username: e.username,
                notes: e.notes,
                creatorName: e.creator.displayName,
                creatorAvatarUrl: e.creator.avatarUrl,
                canDelete: user.id === e.creatorId || user.role === "admin",
              }}
            />
          ))}
        </ul>
      )}

      <p className="font-mono text-[11px] leading-relaxed text-ink/40">
        Passwords are encrypted at rest and only decrypted when you hit
        Reveal/Copy. Friendly reminder: this is a group vault, not Fort
        Knox — don&apos;t put your bank in here.
      </p>
    </div>
  );
}
