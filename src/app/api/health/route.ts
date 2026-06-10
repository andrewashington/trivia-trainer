import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + DB connectivity probe. Public (no secrets in the response)
 * so uptime monitors and the deploy platform can hit it. Returns 503 if
 * the database is unreachable — handy when first wiring up DATABASE_URL.
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
