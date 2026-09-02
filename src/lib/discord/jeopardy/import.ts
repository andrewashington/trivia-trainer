import { db } from "@/lib/db";

/**
 * Clue-bank importer. Pulls the public jwolle1/jeopardy_clue_dataset TSV
 * (~80 MB, ~554k clues, seasons 1–42) straight from GitHub, replaces the
 * jeopardy_clues table, and reports progress in module memory for the admin
 * panel. Runs inside the web process (kicked off from the admin route and
 * left to finish in the background) — a couple of minutes at most.
 *
 * TSV columns: round, clue_value, daily_double_value, category, comments,
 * answer (the prompt read aloud), question (the correct response), air_date,
 * notes.
 */

export const DATASET_URL =
  "https://raw.githubusercontent.com/jwolle1/jeopardy_clue_dataset/main/combined_season1-42.tsv";

export type ImportStatus = {
  status: "idle" | "running" | "done" | "error";
  detail: string;
  imported: number;
  startedAt: string | null;
  finishedAt: string | null;
};

const status: ImportStatus = {
  status: "idle",
  detail: "",
  imported: 0,
  startedAt: null,
  finishedAt: null,
};

export function importStatus(): ImportStatus {
  return { ...status };
}

const BATCH = 2000;

function parseRow(line: string) {
  const cols = line.split("\t");
  if (cols.length < 8) return null;
  const [round, clueValue, , category, comments, clue, response, airDate, notes] = cols;
  const r = Number(round);
  const date = new Date(airDate);
  if (!Number.isInteger(r) || Number.isNaN(date.getTime())) return null;
  if (!category?.trim() || !clue?.trim() || !response?.trim()) return null;
  return {
    round: r,
    value: Number(clueValue) || 0,
    category: category.trim(),
    comments: comments?.trim() ? comments.trim() : null,
    clue: clue.trim(),
    response: response.trim(),
    airDate: date,
    notes: notes?.trim() ? notes.trim() : null,
  };
}

/** Start the import unless one is already running. Resolves when it finishes. */
export async function runImport(): Promise<void> {
  if (status.status === "running") return;
  status.status = "running";
  status.detail = "downloading dataset…";
  status.imported = 0;
  status.startedAt = new Date().toISOString();
  status.finishedAt = null;

  try {
    const res = await fetch(DATASET_URL, { signal: AbortSignal.timeout(5 * 60_000) });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split("\n");
    status.detail = `parsing ${lines.length.toLocaleString()} rows…`;

    const rows: NonNullable<ReturnType<typeof parseRow>>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const row = parseRow(lines[i]);
      if (row) rows.push(row);
    }

    status.detail = "replacing clue bank…";
    await db.$executeRaw`TRUNCATE TABLE jeopardy_clues RESTART IDENTITY`;
    for (let i = 0; i < rows.length; i += BATCH) {
      await db.jeopardyClue.createMany({ data: rows.slice(i, i + BATCH) });
      status.imported = Math.min(rows.length, i + BATCH);
      status.detail = `inserted ${status.imported.toLocaleString()} / ${rows.length.toLocaleString()}`;
    }

    status.status = "done";
    status.detail = `imported ${rows.length.toLocaleString()} clues`;
  } catch (err) {
    status.status = "error";
    status.detail = String(err instanceof Error ? err.message : err).slice(0, 300);
    console.error("[jeopardy] import failed", err);
  } finally {
    status.finishedAt = new Date().toISOString();
  }
}
