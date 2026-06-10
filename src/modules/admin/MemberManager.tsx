"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Badge, Button, Input } from "@/components/ui";

type Member = {
  id: string;
  email: string;
  displayName: string;
  role: "member" | "admin";
};

export function MemberManager({
  members,
  selfId,
}: {
  members: Member[];
  selfId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ welcomeEmailSent: boolean }>("/api/admin/members", {
        method: "POST",
        body: { email, displayName: name },
      });
      setNotice(
        res.welcomeEmailSent
          ? `Welcome email with a sign-in link sent to ${email}.`
          : `Member added, but the welcome email failed — they can still sign in at /signin.`
      );
      setEmail("");
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add member.");
    } finally {
      setBusy(false);
    }
  }

  async function setRole(id: string, role: "member" | "admin") {
    setBusy(true);
    try {
      await api(`/api/admin/members/${id}`, { method: "PATCH", body: { role } });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Role change failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (armedId !== id) {
      setArmedId(id);
      setTimeout(() => setArmedId((a) => (a === id ? null : a)), 3000);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/admin/members/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Removal failed.");
    } finally {
      setBusy(false);
      setArmedId(null);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={addMember} className="brutal-card space-y-3 p-4">
        <p className="brutal-label">Add to the allowlist</p>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="friend@example.com"
          required
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name"
          required
        />
        {error && (
          <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
            {error}
          </p>
        )}
        {notice && (
          <p className="border-2 border-ink bg-accent-green px-3 py-2 text-sm font-bold">
            {notice}
          </p>
        )}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "…" : "Add member"}
        </Button>
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink/40">
          They&apos;ll get a welcome email with a one-tap sign-in link (good for 7 days).
        </p>
      </form>

      <ul className="space-y-3">
        {members.map((m) => (
          <li key={m.id} className="brutal-card flex flex-wrap items-center gap-3 p-3">
            <Avatar name={m.displayName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold leading-snug">
                {m.displayName}
                {m.id === selfId && <span className="text-ink/40"> (you)</span>}
              </p>
              <p className="truncate font-mono text-xs text-ink/50">{m.email}</p>
            </div>
            <Badge
              className={m.role === "admin" ? "bg-accent-grape text-white" : "bg-paper"}
            >
              {m.role}
            </Badge>
            {m.id !== selfId && (
              <span className="flex gap-1.5">
                <button
                  onClick={() => setRole(m.id, m.role === "admin" ? "member" : "admin")}
                  disabled={busy}
                  className="brutal-press border-2 border-ink bg-card px-2 py-1 font-mono text-xs font-bold shadow-brutal-sm"
                >
                  {m.role === "admin" ? "Demote" : "Promote"}
                </button>
                <button
                  onClick={() => remove(m.id)}
                  disabled={busy}
                  className={`brutal-press border-2 border-ink px-2 py-1 font-mono text-xs font-bold shadow-brutal-sm ${
                    armedId === m.id ? "bg-accent-red text-white" : "bg-card"
                  }`}
                >
                  {armedId === m.id ? "Sure?" : "Remove"}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
