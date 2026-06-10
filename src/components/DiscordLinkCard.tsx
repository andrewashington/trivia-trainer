"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";

/**
 * Link/unlink the signed-in user's Discord account. The code comes
 * from running /link in the Discord server (the bot replies with it
 * privately); redeeming it sets User.discordUserId.
 */
export function DiscordLinkCard({ linked }: { linked: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedAs, setLinkedAs] = useState<string | null>(null);

  async function onLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ discordUsername: string }>("/api/me/discord", {
        method: "POST",
        body: { code },
      });
      setLinkedAs(res.discordUsername);
      setCode("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't link.");
    } finally {
      setBusy(false);
    }
  }

  async function onUnlink() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/discord", { method: "DELETE" });
      setLinkedAs(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't unlink.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="brutal-card space-y-3 p-5">
      <span className="brutal-label">Discord</span>
      {linked ? (
        <>
          <p className="text-sm">
            Connected{linkedAs ? ` as ${linkedAs}` : ""}. Buttons and slash commands in the
            server now act as you.
          </p>
          <Button type="button" disabled={busy} onClick={onUnlink} className="w-full">
            {busy ? "Working…" : "Disconnect Discord"}
          </Button>
        </>
      ) : (
        <form onSubmit={onLink} className="space-y-3">
          <p className="text-sm text-ink/70">
            Run <code className="font-mono font-bold">/link</code> in the Discord server, then
            enter the code the bot gives you.
          </p>
          <Field label="Link code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={16}
              required
              className="font-mono uppercase tracking-widest"
            />
          </Field>
          {error && (
            <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !code.trim()} className="w-full">
            {busy ? "Linking…" : "Link Discord account"}
          </Button>
        </form>
      )}
    </div>
  );
}
