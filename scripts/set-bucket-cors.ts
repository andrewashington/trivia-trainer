/**
 * (Re)apply the Railway Bucket CORS policy so the browser's direct
 * presigned PUT uploads are allowed from the app's current origin(s).
 *
 *   railway run npx tsx scripts/set-bucket-cors.ts
 *
 * Run this whenever the app's URL/domain changes (uploads start failing
 * with a CORS/preflight error). Uses the same S3_* env the app uses.
 */
import {
  S3Client,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";

// Every origin the app is served from and uploads can originate at.
const ALLOWED_ORIGINS = [
  "https://udm-plus.up.railway.app",
  "https://www.deliciouscommunications.com",
  "https://deliciouscommunications.com",
];

const BUCKET = process.env.S3_BUCKET ?? "udmplus";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "auto",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

async function main() {
  if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID) {
    throw new Error("Missing S3_* env. Run via `railway run npx tsx scripts/set-bucket-cors.ts`.");
  }

  console.log(`Bucket: ${BUCKET} @ ${process.env.S3_ENDPOINT}`);

  try {
    const before = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
    console.log("Current CORS:", JSON.stringify(before.CORSRules, null, 2));
  } catch {
    console.log("Current CORS: (none / unreadable)");
  }

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ALLOWED_ORIGINS,
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );

  console.log("\n✅ Applied CORS for:");
  for (const o of ALLOWED_ORIGINS) console.log(`   - ${o}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
