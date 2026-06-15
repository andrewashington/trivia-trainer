import { spawn } from "node:child_process";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

type MetaRow = {
  status: string;
  detail: string;
  stats: unknown;
  started_at: Date | null;
  last_built_at: Date | null;
};

async function readMeta() {
  const [m] = await db.$queryRaw<MetaRow[]>`
    SELECT status, detail, stats, started_at, last_built_at FROM discord_archive.insights_meta WHERE id = 1
  `;
  return m ?? null;
}

/** GET — current insights build status (for the admin panel banner). */
export const GET = apiHandler(async () => {
  await requireAdmin();
  const m = await readMeta();
  return NextResponse.json({
    status: m?.status ?? "idle",
    detail: m?.detail ?? "",
    stats: m?.stats ?? null,
    startedAt: m?.started_at?.toISOString() ?? null,
    lastBuiltAt: m?.last_built_at?.toISOString() ?? null,
  });
});

/**
 * POST — kick off the insights rebuild (k-means + projection + dossiers +
 * lexicon + soulmate centroids). Heavy + CPU-bound, so we spawn the script as a
 * detached child process (it doesn't block the web event loop) and return
 * immediately; the script itself maintains discord_archive.insights_meta.
 */
export const POST = apiHandler(async () => {
  await requireAdmin();

  const m = await readMeta();
  if (m?.status === "running" && m.started_at && Date.now() - m.started_at.getTime() < 30 * 60 * 1000) {
    return NextResponse.json({ ok: false, error: "A rebuild is already running." }, { status: 409 });
  }

  await db.$executeRaw`
    UPDATE discord_archive.insights_meta
    SET status = 'running', detail = 'starting…', started_at = now()
    WHERE id = 1
  `;

  try {
    const script = join(process.cwd(), "scripts", "discord-insights.mjs");
    const child = spawn("node", [script], {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (err) {
    await db.$executeRaw`
      UPDATE discord_archive.insights_meta
      SET status = 'error', detail = ${String(err).slice(0, 300)}
      WHERE id = 1
    `;
    return NextResponse.json({ ok: false, error: "Failed to start the rebuild." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
});
