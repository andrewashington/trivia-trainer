"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input, Textarea } from "@/components/ui";

type RecipeShape = { id: string; title: string; body: string; imageKey: string | null };

export function RecipeForm({ recipe }: { recipe?: RecipeShape }) {
  const router = useRouter();
  const [title, setTitle] = useState(recipe?.title ?? "");
  const [body, setBody] = useState(recipe?.body ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return recipe?.imageKey ?? null;
    const { key, uploadUrl } = await api<{ key: string; uploadUrl: string }>(
      "/api/recipes/image",
      { method: "POST", body: { mimeType: imageFile.type } }
    );
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": imageFile.type },
      body: imageFile,
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
