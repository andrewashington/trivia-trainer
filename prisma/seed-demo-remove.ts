/**
 * Wipe everything `seed-demo.ts` created: demo users (cascades take
 * their recipes, events, RSVPs, items, listings, polls, votes, claims,
 * forfeits, spins, pins, cards, vault entries, files, submissions…)
 * plus the demo-flagged outbox rows. Real members' data is untouched.
 * Run before the final deploy.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const demoUsers = await db.user.findMany({
    where: { email: { endsWith: "@demo.udmplus.local" } },
    select: { id: true, email: true },
  });
  if (demoUsers.length === 0) {
    console.log("No demo users found — nothing to remove.");
  } else {
    const { count } = await db.user.deleteMany({
      where: { id: { in: demoUsers.map((u) => u.id) } },
    });
    console.log(`✓ deleted ${count} demo users (+ all their content via cascades)`);
  }

  const outbox = await db.outboxEvent.deleteMany({
    where: { payload: { path: ["demo"], equals: true } as Prisma.JsonFilter },
  });
  console.log(`✓ deleted ${outbox.count} demo outbox events`);

  console.log("Demo data removed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
