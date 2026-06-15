import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { HubTabs } from "@/modules/discord-stats/components/HubTabs";

export const metadata = { title: "Discord Stats" };

export default async function DiscordStatsLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  return (
    <div className="space-y-6">
      <PageHeader title="Discord Stats" icon="users" accentBg="bg-accent-blurple text-white" />
      <HubTabs />
      <div>{children}</div>
    </div>
  );
}
