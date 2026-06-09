import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "auto",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.S3_BUCKET ?? "udmplus";

// Files are private; all access goes through short-lived presigned URLs.
const UPLOAD_TTL_SECONDS = 60 * 10;
const DOWNLOAD_TTL_SECONDS = 60 * 15;

export function maxFileSizeBytes(): number {
  return Number(process.env.MAX_FILE_SIZE_MB ?? 25) * 1024 * 1024;
}

export async function presignUpload(key: string, mimeType: string) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: mimeType }),
    { expiresIn: UPLOAD_TTL_SECONDS }
  );
}

export async function presignDownload(key: string, filename?: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: filename
        ? `attachment; filename="${filename.replace(/"/g, "")}"`
        : undefined,
    }),
    { expiresIn: DOWNLOAD_TTL_SECONDS }
  );
}

/** Inline view (no attachment disposition) — used for recipe images. */
export async function presignView(key: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: DOWNLOAD_TTL_SECONDS }
  );
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
