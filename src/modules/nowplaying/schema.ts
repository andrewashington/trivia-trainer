import { z } from "zod";
import type { IconName } from "@/components/icons";

export const nowPlayingInput = z.object({
  mediaType: z.enum(["show", "movie", "book"]),
  title: z.string().trim().min(1, "Title is required").max(300),
  note: z.string().trim().max(500).nullish(),
  // Attached when the title was picked from TMDB search.
  tmdbId: z.number().int().positive().nullish(),
  posterPath: z.string().trim().max(200).nullish(),
  releaseYear: z.number().int().min(1870).max(2100).nullish(),
});

export const nowPlayingPatch = z.object({
  mediaType: z.enum(["show", "movie", "book"]).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  note: z.string().trim().max(500).nullish(),
  status: z.enum(["active", "finished"]).optional(),
  rating: z.number().int().min(1).max(5).nullish(),
});

export const MEDIA_ICONS: Record<string, IconName> = {
  show: "tv",
  movie: "clapperboard",
  book: "book-open",
};
