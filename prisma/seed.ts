/**
 * First-run seed: creates the owner/admin from SEED_ADMIN_EMAIL and, in
 * non-production, a couple of sample members and rows so every module
 * has something to show. Idempotent — safe to re-run.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (!adminEmail) {
    throw new Error("Set SEED_ADMIN_EMAIL in your env to seed the first admin.");
  }

  const admin = await db.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: { role: "admin" },
    create: {
      email: adminEmail.toLowerCase(),
      displayName: process.env.SEED_ADMIN_NAME ?? "The Owner",
      role: "admin",
    },
  });
  console.log(`✓ admin: ${admin.email}`);

  if (process.env.NODE_ENV === "production") {
    console.log("Production: skipping sample data.");
    return;
  }

  const sam = await db.user.upsert({
    where: { email: "sam@example.com" },
    update: {},
    create: { email: "sam@example.com", displayName: "Sample Sam" },
  });

  const recipeCount = await db.recipe.count();
  if (recipeCount === 0) {
    await db.recipe.create({
      data: {
        authorId: admin.id,
        title: "Emergency 2am Quesadilla",
        body: [
          "The official UDM+ inaugural recipe.",
          "",
          "## You need",
          "- Tortillas (2)",
          "- Whatever cheese is in the drawer",
          "- Hot sauce of the house",
          "",
          "## Do this",
          "1. Pan on medium. No oil, live dangerously.",
          "2. Tortilla, cheese, tortilla.",
          "3. Flip when you smell toast. Eat over the sink.",
        ].join("\n"),
      },
    });
    console.log("✓ sample recipe");
  }

  const eventCount = await db.event.count();
  if (eventCount === 0) {
    const start = new Date();
    start.setDate(start.getDate() + 7);
    start.setHours(19, 0, 0, 0);
    const event = await db.event.create({
      data: {
        creatorId: admin.id,
        title: "Game Night",
        description: "Bring snacks. Controller-throwers will be benched.",
        location: "The usual couch",
        startAt: start,
      },
    });
    await db.rsvp.createMany({
      data: [
        { eventId: event.id, userId: admin.id, status: "going" },
        { eventId: event.id, userId: sam.id, status: "maybe" },
      ],
    });
    console.log("✓ sample event + RSVPs");
  }

  const playingCount = await db.nowPlayingItem.count();
  if (playingCount === 0) {
    await db.nowPlayingItem.createMany({
      data: [
        {
          userId: admin.id,
          mediaType: "show",
          title: "Severance",
          note: "Please enjoy each episode equally.",
        },
        {
          userId: sam.id,
          mediaType: "book",
          title: "Project Hail Mary",
          note: "Jazz hands.",
        },
      ],
    });
    console.log("✓ sample now-playing items");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
