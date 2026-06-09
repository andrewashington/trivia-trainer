import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/session";
import { geocodeQuery } from "@/modules/map/schema";

/**
 * Address search, proxied to OpenStreetMap's Nominatim — free, no API
 * key. Proxying (rather than calling from the browser) lets us send the
 * identifying User-Agent their usage policy requires and keeps the door
 * open for a paid geocoder later without touching the client.
 * Policy: https://operations.osmfoundation.org/policies/nominatim/
 * (max 1 req/s — fine at friend-group scale).
 */
export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const { q } = geocodeQuery.parse({
    q: new URL(req.url).searchParams.get("q") ?? "",
  });

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent": "UDMplus/1.0 (friend-group app; self-hosted)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new HttpError(502, "Address search is grumpy right now — try again.");

  const raw = (await res.json()) as {
    display_name: string;
    lat: string;
    lon: string;
  }[];

  const results = raw.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
  return NextResponse.json({ results });
});
