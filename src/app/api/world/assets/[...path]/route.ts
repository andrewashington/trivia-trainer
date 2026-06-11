import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { presignDownload } from "@/lib/storage";
import { HttpError } from "@/lib/session";

// Root of the runtime world assets (dev only — never committed)
const RUNTIME_DIR = path.join(process.cwd(), "assets-src", "runtime", "world");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".json": "application/json",
};

export const GET = apiHandler(
  async (_req: Request, { params }: { params: Promise<{ path: string[] }> }) => {
    await requireUser();

    const { path: segments } = await params;
    const relative = segments.join("/");

    // Traversal guard: must not escape the runtime dir
    const resolved = path.resolve(RUNTIME_DIR, relative);
    if (!resolved.startsWith(RUNTIME_DIR + path.sep) && resolved !== RUNTIME_DIR) {
      throw new HttpError(400, "Invalid path.");
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) throw new HttpError(400, "Unsupported file type.");

    if (process.env.NODE_ENV !== "production") {
      // Development: stream directly from assets-src/runtime/world/
      if (!fs.existsSync(resolved)) {
        throw new HttpError(404, "Asset not found.");
      }
      const data = fs.readFileSync(resolved);
      return new Response(data, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
        },
      });
    }

    // Production: redirect to a presigned S3 URL
    const key = `world/${relative}`;
    const url = await presignDownload(key);
    return NextResponse.redirect(url, 302);
  }
);
