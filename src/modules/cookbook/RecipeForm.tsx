"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input, Textarea } from "@/components/ui";

type RecipeShape = { id: string; title: string; body: string; imageKey: string | null };

// Downscale + re-encode a photo in the browser before upload. Recipe
// images were loading slowly because phone-camera originals (often 3–8MB)
// were stored as-is; capping the long edge and re-encoding to webp brings
// them down to a couple hundred KB with no visible quality loss. GIFs are
// passed through untouched (canvas would flatten the animation), and if
// the result somehow isn't smaller we keep the original.
const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.82;

async function compressImage(file: File): Promise<{ blob: Blob; type: string }> {
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") {
    return { blob: file, type: file.type };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, type: file.type };
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/webp", WEBP_QUALITY)
    );
    if (!blob || blob.size >= file.size) return { blob: file, type: file.type };
    return { blob, type: "image/webp" };
  } catch {
    return { blob: file, type: file.type };
  }
}

export function RecipeForm({ recipe }: { recipe?: RecipeShape }) {
  const router = useRouter();
  const [title, setTitle] = useState(recipe?.title ?? "");
  const [body, setBody] = useState(recipe?.body ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return recipe?.imageKey ?? null;
    const { blob, type } = await compressImage(imageFile);
    const { key, uploadUrl } = await api<{ key: string; uploadUrl: string }>(
      "/api/recipes/image",
      { method: "POST", body: { mimeType: type } }
    );
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": type },
      body: blob,
    });
    if (!put.ok) throw new Error("Image upload failed.");
    return key;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const imageKey = await uploadImage();
      if (recipe) {
        await api(`/api/recipes/${recipe.id}`, {
          method: "PATCH",
          body: { title, body, imageKey },
        });
        router.push(`/cookbook/${recipe.id}`);
      } else {
        const created = await api<{ recipe: { id: string } }>("/api/recipes", {
          method: "POST",
          body: { title, body, imageKey },
        });
        router.push(`/cookbook/${created.recipe.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-4 p-5">
      <Field label="Title">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nana's lasagna"
          required
        />
      </Field>
      <Field label="Recipe (markdown is fine)">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          placeholder={"What's in it, how to make it, hot takes…"}
          required
        />
      </Field>
      <Field label={recipe?.imageKey ? "Replace photo (optional)" : "Photo (optional)"}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="brutal-input file:mr-3 file:border-2 file:border-ink file:bg-accent-yellow file:px-3 file:py-1 file:font-display file:font-bold file:uppercase"
        />
      </Field>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Saving…" : recipe ? "Save changes" : "Add to the cookbook"}
      </Button>
    </form>
  );
}
