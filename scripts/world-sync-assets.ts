/**
 * WORLD ASSET SYNC — uploads assets-src/runtime/world/ to S3/R2
 * under the key prefix `world/`.
 *
 *   npx tsx scripts/world-sync-assets.ts             # uses local .env
 *   railway run npx tsx scripts/world-sync-assets.ts # uses prod env
 *
 * Run this after editing the runtime world assets to make them available
 * in production (the asset API route redirects to presigned S3 URLs in prod).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative, extname } from "path";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

// tsx doesn't load .env — fill in anything missing with a minimal parse.
const envPath = join(__dirname, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

const RUNTIME_DIR = join(__dirname, "..", "assets-src", "runtime", "world");
const BUCKET = process.env.S3_BUCKET ?? "udmplus";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".json": "application/json",
};

if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID) {
  throw new Error(
    "Missing S3_* env vars. Run via `railway run npx tsx scripts/world-sync-assets.ts` " +
    "or ensure .env has S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET."
  );
}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "auto",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

/** Walk a directory recursively, yielding absolute paths. */
function* walkDir(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      yield* walkDir(abs);
    } else {
      yield abs;
    }
  }
}

async function main() {
  if (!existsSync(RUNTIME_DIR)) {
    throw new Error(`Runtime dir not found: ${RUNTIME_DIR}`);
  }

  const files = [...walkDir(RUNTIME_DIR)];
  console.log(`Uploading ${files.length} file(s) to s3://${BUCKET}/world/ …`);

  for (const abs of files) {
    const rel = relative(RUNTIME_DIR, abs).replace(/\\/g, "/");
    const key = `world/${rel}`;
    const ext = extname(abs).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    const body = readFileSync(abs);

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    console.log(`  uploaded: ${key}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
