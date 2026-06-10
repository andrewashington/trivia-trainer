import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { CommandLauncher } from "@/components/command/CommandLauncher";

/**
 * Server wrapper for the global "+ New" launcher: gathers the props the
 * prop-taking create forms need (mirroring each module page's own
 * derivation) and hands them to the client modal.
 */
export async function CommandButton() {
  const user = await currentUser();
  if (!user) return null;

  const members = await db.user.findMany({
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  return (
    <CommandLauncher
      // ClaimForm: everyone but yourself (same as /stakes).
      members={members
        .filter((m) => m.id !== user.id)
        .map((m) => ({ id: m.id, name: m.displayName }))}
      // AddPromptForm: every member's name (same as /reveal).
      memberNames={members.map((m) => m.displayName)}
      // AddListingForm: same as /marketplace.
      hasVenmo={!!user.venmoHandle}
      // UploadForm: same as /files.
      maxMb={Number(process.env.MAX_FILE_SIZE_MB ?? 25)}
    />
  );
}
