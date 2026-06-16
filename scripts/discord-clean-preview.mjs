/**
 * Preview the content cleaner on real archive messages — raw -> cleaned — WITHOUT
 * writing anything. Run before the rebuild to sanity-check the transformations.
 *
 *   npm run discord:clean:preview            # mixed sample (mentions/urls/emoji)
 *   npm run discord:clean:preview -- 40      # N samples
 *
 * Needs DATABASE_URL pointed at the archive.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { buildResolvers, cleanLine } from "./discord-clean.mjs";

loadEnv();
const db = new PrismaClient();
const N = Number(process.argv.find((a) => /^\d+$/.test(a))) || 24;

async function run() {
  const resolvers = await buildResolvers(db, process.cwd());
  // Pull a spread that exercises every rule.
  const rows = await db.$queryRaw`
    (SELECT author_id, author_name, content, attachments, has_embed FROM discord_archive.messages
       WHERE content ~ '<@!?[0-9]+>' AND deleted_at IS NULL LIMIT ${Math.ceil(N / 3)})
    UNION ALL
    (SELECT author_id, author_name, content, attachments, has_embed FROM discord_archive.messages
       WHERE content ~* 'https?://' AND content !~* 'tenor|giphy' AND deleted_at IS NULL LIMIT ${Math.ceil(N / 3)})
    UNION ALL
    (SELECT author_id, author_name, content, attachments, has_embed FROM discord_archive.messages
       WHERE (content ~ '<a?:[a-zA-Z0-9_]+:[0-9]+>' OR content ~ '<#[0-9]+>' OR content ~* 'tenor')
         AND deleted_at IS NULL LIMIT ${Math.ceil(N / 3)})
  `;

  for (const m of rows) {
    const cleaned = cleanLine(m, resolvers);
    const raw = `${m.author_name}: ${(m.content ?? "").replace(/\s+/g, " ").slice(0, 200)}`;
    console.log(`\nRAW : ${raw}`);
    console.log(`CLEAN: ${cleaned ?? "(skipped — empty)"}`);
  }
  console.log(`\n${rows.length} samples.\n`);
}

function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
