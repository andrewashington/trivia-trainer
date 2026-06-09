"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input, Textarea } from "@/components/ui";

type RelatedParty = { name: string; relation: string; phone: string; email: string };

type CardShape = {
  phone: string;
  email: string;
  birthday: string; // YYYY-MM-DD or ""
  address: string;
  notes: string;
  relatedParties: RelatedParty[];
};

export function ContactCardForm({
  userId,
  initial,
}: {
  userId: string;
  initial: CardShape;
}) {
  const router = useRouter();
  const [card, setCard] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof CardShape, v: string) => setCard({ ...card, [k]: v });

  function setParty(i: number, k: keyof RelatedParty, v: string) {
    const parties = card.relatedParties.map((p, idx) =>
      idx === i ? { ...p, [k]: v } : p
    );
    setCard({ ...card, relatedParties: parties });
  }

  function addParty() {
    setCard({
      ...card,
      relatedParties: [
        ...card.relatedParties,
        { name: "", relation: "", phone: "", email: "" },
      ],
    });
  }

  function removeParty(i: number) {
    setCard({
      ...card,
      relatedParties: card.relatedParties.filter((_, idx) => idx !== i),
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/contacts/${userId}`, {
        method: "PUT",
        body: {
          phone: card.phone || null,
          email: card.email || null,
          birthday: card.birthday || null,
          address: card.address || null,
          notes: card.notes || null,
          relatedParties: card.relatedParties
            .filter((p) => p.name.trim())
            .map((p) => ({
              name: p.name,
              relation: p.relation || null,
              phone: p.phone || null,
              email: p.email || null,
            })),
        },
      });
      router.push("/contacts");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-4 p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <Input value={card.phone} onChange={(e) => set("phone", e.target.value)} placeholder="555-0123" />
        </Field>
        <Field label="Birthday">
          <Input type="date" value={card.birthday} onChange={(e) => set("birthday", e.target.value)} />
        </Field>
      </div>
      <Field label="Preferred email (if different from login)">
        <Input type="email" value={card.email} onChange={(e) => set("email", e.target.value)} placeholder="optional" />
      </Field>
      <Field label="Address">
        <Textarea value={card.address} onChange={(e) => set("address", e.target.value)} rows={2} placeholder={"123 Hangout St\nSomewhere, ST 00000"} />
      </Field>
      <Field label="Notes">
        <Input value={card.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Gate code 4242. Allergic to cilantro." />
      </Field>

      <div className="space-y-3 border-t-2 border-dashed border-ink/30 pt-3">
        <p className="brutal-label">Related parties (spouse, partner, +1…)</p>
        {card.relatedParties.map((p, i) => (
          <div key={i} className="space-y-2 border-2 border-ink bg-paper p-3">
            <div className="flex gap-2">
              <Input value={p.name} onChange={(e) => setParty(i, "name", e.target.value)} placeholder="Name" />
              <Input value={p.relation} onChange={(e) => setParty(i, "relation", e.target.value)} placeholder="Relation" />
              <button
                type="button"
                onClick={() => removeParty(i)}
                className="brutal-press shrink-0 border-2 border-ink bg-card px-2 font-mono text-xs font-bold shadow-brutal-sm"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-2">
              <Input value={p.phone} onChange={(e) => setParty(i, "phone", e.target.value)} placeholder="Phone" />
              <Input type="email" value={p.email} onChange={(e) => setParty(i, "email", e.target.value)} placeholder="Email" />
            </div>
          </div>
        ))}
        {card.relatedParties.length < 10 && (
          <Button type="button" variant="ghost" onClick={addParty} className="w-full">
            + Add person
          </Button>
        )}
      </div>

      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Saving…" : "Save my card"}
      </Button>
    </form>
  );
}
