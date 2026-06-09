import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { fetchLinkPreview } from "@/modules/wishlist/linkPreview";
import { wishlistPreviewRequest } from "@/modules/wishlist/schema";

// Scrape OG metadata from a product link to prefill the add form.
export const POST = apiHandler(async (req: Request) => {
  await requireUser();
  const { url } = await parseBody(req, wishlistPreviewRequest);
  const preview = await fetchLinkPreview(url);
  return NextResponse.json({ preview });
});
