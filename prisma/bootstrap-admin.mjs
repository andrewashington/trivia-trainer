/**
 * Production admin bootstrap — runs on every container boot (after
 * migrations) from docker-entrypoint.sh. Plain ESM using @prisma/client
 * directly, so it works in the standalone runtime image where tsx and
 * devDependencies are absent.
 *
 * Idempotent: upserts the SEED_ADMIN_EMAIL user as an admin. Never
 * creates sample data. No-op (with a notice) if SEED_ADMIN_EMAIL is
 * unset, so a misconfigured deploy fails loud-but-safe.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.warn("⚠ SEED_ADMIN_EMAIL not set — skipping admin bootstrap. Nobody can sign in!");
    return;
  }
  const name = process.env.SEED_ADMIN_NAME?.trim() || "The Owner";
  const admin = await db.user.upsert({
    where: { email },
    update: { role: "admin" },
    create: { email, displayName: name, role: "admin" },
  });
  console.log(`✓ Admin ready: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error("Admin bootstrap failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
