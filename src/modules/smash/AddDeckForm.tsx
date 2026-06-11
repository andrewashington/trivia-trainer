"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button, Input, Textarea } from "@/components/ui";
import { useCloseModuleForm } from "@/components/ModuleHeader";
import { CARD_IMAGE_MIME_TYPES } from "@/modules/smash/schema";

/** Parse "Name | https://image.url" lines into card inputs. */
function parseCards(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, url] = line.split("|").map((s) => s.trim());
      return { label, imageUrl: url || null };
    });
}

export function AddDeckForm() {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [cardsRaw, setCardsRaw] = useState("");
  // Attached image per card label — survives line reordering, unlike an
  // index key. Last line with the same label wins the photo, fine here.
  const [photos, setPhotos] = useState<Map<string, File>>(new Map());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingLabel = useRef<string | null>(null);

  const cards = parseCards(cardsRaw);
  const cardCount = cards.length;

  function pickPhoto(label: string) {
    pendingLabel.current = label;
    fileInput.current?.click();
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const label = pendingLabel.current;
    e.target.value = "";
    if (!file || !label) return;
    setPhotos((m) => new Map(m).set(label, file));
  }

  function clearPhoto(label: string) {
    setPhotos((m) => {
      const next = new Map(m);
      next.delete(label);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payloadCards = cards.map((c) => {
        const file = photos.get(c.label);
        return file
          ? {
              label: c.label,
              image: { filename: file.name, mimeType: file.type, sizeBytes: file.size },
            }
          : c;
      });

      setProgress("Dealing…");
      const { uploads } = await api<{
        uploads: { position: number; uploadUrl: string }[];
      }>("/api/smash", {
        method: "POST",
        body: { title, detail: detail || null, cards: payloadCards },
      });

      // Push the bytes straight to the bucket — same flow as photobook.
      for (let i = 0; i < uploads.length; i++) {
        const u = uploads[i];
        const file = photos.get(cards[u.position]?.label ?? "");
        if (!file) continue;
        setProgress(`Uploading photos ${i + 1}/${uploads.length}…`);
        const put = await fetch(u.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error(`Upload failed for “${cards[u.position]?.label}”.`);
      }

      setTitle("");
      setDetail("");
      setCardsRaw("");
      setPhotos(new Map());
      router.refresh();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't deal that deck.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">Deal a deck</p>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Theme — e.g. 90s heartthrobs"
        required
        maxLength={100}
      />
      <Input
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="House rules / context (optional)"
        maxLength={300}
      />
      <Textarea
        value={cardsRaw}
        onChange={(e) => setCardsRaw(e.target.value)}
        rows={6}
        placeholder={"One name per line — optionally `Name | https://image.url`"}
        required
      />

      {cardCount > 0 && (
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase text-ink/50">
            Photos (optional) — attach one per card
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {cards.map((c, i) => {
              const file = photos.get(c.label);
              return (
                <li key={`${c.label}-${i}`}>
                  <button
                    type="button"
                    onClick={() => (file ? clearPhoto(c.label) : pickPhoto(c.label))}
                    title={file ? `${file.name} — click to remove` : `Attach a photo of ${c.label}`}
                    className={`brutal-press border-2 border-ink px-2 py-0.5 font-mono text-[11px] font-bold shadow-brutal-sm ${
                      file ? "bg-accent-green" : c.imageUrl ? "bg-accent-yellow" : "bg-card"
                    }`}
                  >
                    {file ? "🖼✓ " : c.imageUrl ? "🔗 " : "📷 "}
                    {c.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept={CARD_IMAGE_MIME_TYPES.join(",")}
        onChange={onFilePicked}
        className="hidden"
      />

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase text-ink/50">
          {progress ??
            `${cardCount} card${cardCount === 1 ? "" : "s"} ${cardCount < 2 ? "— need at least 2" : ""}`}
        </span>
        <Button type="submit" variant="primary" disabled={busy || !title.trim() || cardCount < 2}>
          {busy ? "…" : "Deal it"}
        </Button>
      </div>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
    </form>
  );
}
