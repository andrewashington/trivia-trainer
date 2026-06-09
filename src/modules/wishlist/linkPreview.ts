import { lookup } from "dns/promises";
import { isIP } from "net";
import { HttpError } from "@/lib/session";

export type LinkPreview = {
  title: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

/** Server-side fetch of arbitrary user URLs — keep it away from the
 * internal network (SSRF guard). */
function isPrivateAddress(addr: string): boolean {
  if (addr.includes(":")) {
    // IPv6: loopback, link-local, unique-local, v4-mapped private.
    const a = addr.toLowerCase();
    return (
      a === "::1" ||
      a.startsWith("fe80:") ||
      a.startsWith("fc") ||
      a.startsWith("fd") ||
      a.startsWith("::ffff:") // be conservative with v4-mapped
    );
  }
  const [o1, o2] = addr.split(".").map(Number);
  return (
    o1 === 10 ||
    o1 === 127 ||
    o1 === 0 ||
    (o1 === 172 && o2 >= 16 && o2 <= 31) ||
    (o1 === 192 && o2 === 168) ||
    (o1 === 169 && o2 === 254)
  );
}

async function assertSafeUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "Only http(s) links.");
  }
  const host = url.hostname;
  const addr = isIP(host) ? host : (await lookup(host)).address;
  if (isPrivateAddress(addr)) {
    throw new HttpError(400, "That host isn't reachable from here.");
  }
  return url;
}

function pickMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    // Match <meta ... property|name="X" ... content="Y"> in either order.
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
        "i"
      ),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return decodeEntities(m[1].trim());
    }
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/**
 * Fetch a page and scrape Open Graph metadata — no external API, no
 * heavy parser dep. Best-effort: returns nulls rather than failing the
 * user's add flow.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  const url = await assertSafeUrl(rawUrl);

  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
    headers: {
      // Some shops gate OG tags behind "real browser" UAs.
      "User-Agent":
        "Mozilla/5.0 (compatible; UDMplus-LinkPreview/1.0; +https://github.com/andrewashington)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new HttpError(422, `That link answered ${res.status}.`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("html")) {
    throw new HttpError(422, "That link isn't a web page.");
  }
  // First 500 KB is plenty — OG tags live in <head>.
  const html = (await res.text()).slice(0, 500_000);

  const title =
    pickMeta(html, ["og:title", "twitter:title"]) ??
    (decodeEntities(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "") ||
      null);
  const imageUrl = pickMeta(html, ["og:image", "twitter:image"]);
  const siteName = pickMeta(html, ["og:site_name"]) ?? url.hostname.replace(/^www\./, "");

  return {
    title,
    imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : null,
    siteName,
  };
}
