"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup, Marker } from "leaflet";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";
import { PIN_CATEGORIES, pinEmoji } from "@/modules/map/schema";

export type PinView = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address: string | null;
  note: string | null;
  creatorName: string;
  canDelete: boolean;
};

type GeocodeResult = { label: string; lat: number; lng: number };
type Draft = GeocodeResult & { fromSearch: boolean };

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function markerHtml(emoji: string, draft = false): string {
  return `<div style="
    display:flex;align-items:center;justify-content:center;
    width:34px;height:34px;font-size:18px;
    background:${draft ? "#FFD60A" : "#fff"};
    border:3px solid #101010;box-shadow:3px 3px 0 #101010;
  ">${emoji}</div>`;
}

export function MapBoard({ initialPins }: { initialPins: PinView[] }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const pinLayerRef = useRef<LayerGroup | null>(null);
  const draftMarkerRef = useRef<Marker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  const [ready, setReady] = useState(false);
  const [pins, setPins] = useState(initialPins);

  // Add-pin flow state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("food");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Leaflet touches `window` at import time, so it loads in an effect —
  // the page itself stays server-renderable.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapEl.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapEl.current, { zoomControl: true });
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      pinLayerRef.current = L.layerGroup().addTo(map);
      map.setView([39.5, -98.35], 4); // sensible default; fitBounds below
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)draw pin markers whenever pins change.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = pinLayerRef.current;
    const map = mapRef.current;
    if (!ready || !L || !layer || !map) return;
    layer.clearLayers();
    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: L.divIcon({
          html: markerHtml(pinEmoji(pin.category)),
          className: "",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
      });
      marker.bindPopup(
        `<strong style="font-size:14px">${escapeHtml(pin.name)}</strong><br/>` +
          (pin.note ? `<em>${escapeHtml(pin.note)}</em><br/>` : "") +
          `<span style="opacity:.6">pinned by ${escapeHtml(pin.creatorName)}</span>`
      );
      marker.addTo(layer);
    }
    if (pins.length > 0 && !draft) {
      map.fitBounds(
        L.latLngBounds(pins.map((p) => [p.lat, p.lng])),
        { padding: [40, 40], maxZoom: 14 }
      );
    }
  }, [ready, pins, draft]);

  // Draft marker for the pin being added.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
    if (draft) {
      draftMarkerRef.current = L.marker([draft.lat, draft.lng], {
        icon: L.divIcon({
          html: markerHtml(pinEmoji(category), true),
          className: "",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        zIndexOffset: 1000,
      }).addTo(map);
      map.setView([draft.lat, draft.lng], Math.max(map.getZoom(), 15));
    }
  }, [ready, draft, category]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const { results } = await api<{ results: GeocodeResult[] }>(
        `/api/map/geocode?q=${encodeURIComponent(query)}`
      );
      setResults(results);
      if (results.length === 0) setError("Nothing found — try adding a city name.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  function pickResult(r: GeocodeResult) {
    setDraft({ ...r, fromSearch: true });
    setResults([]);
    if (!name) setName(r.label.split(",")[0] ?? "");
  }

  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const { pin } = await api<{ pin: PinView & { creator?: unknown } }>(
        "/api/map/pins",
        {
          method: "POST",
          body: {
            name,
            category,
            lat: draft.lat,
            lng: draft.lng,
            address: draft.fromSearch ? draft.label : null,
            note: note || null,
          },
        }
      );
      setPins([
        { ...pin, creatorName: "You", canDelete: true },
        ...pins,
      ]);
      setDraft(null);
      setName("");
      setNote("");
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the pin.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePin(id: string) {
    try {
      await api(`/api/map/pins/${id}`, { method: "DELETE" });
      setPins(pins.filter((p) => p.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  function focusPin(pin: PinView) {
    mapRef.current?.setView([pin.lat, pin.lng], 15);
  }

  return (
    <div className="space-y-5">
      <div ref={mapEl} className="brutal-card h-[55vh] min-h-[320px] w-full !p-0" />

      {/* Add flow: search → pick → describe → save */}
      <div className="brutal-card space-y-3 p-4">
        <p className="brutal-label">Drop a pin</p>
        <form onSubmit={search} className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search an address or place…"
          />
          <Button type="submit" variant="yellow" disabled={searching || query.trim().length < 2} className="shrink-0">
            {searching ? "…" : "🔍 Search"}
          </Button>
        </form>

        {results.length > 0 && (
          <ul className="divide-y-2 divide-ink border-2 border-ink">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => pickResult(r)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent-yellow"
                >
                  📍 {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        {draft && (
          <form onSubmit={savePin} className="space-y-3 border-t-2 border-dashed border-ink/30 pt-3">
            <p className="font-mono text-xs text-ink/60">📌 {draft.label}</p>
            <Field label="Call it">
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="The good taco truck" />
            </Field>
            <div className="flex flex-wrap gap-2">
              {PIN_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`brutal-press border-2 border-ink px-2 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
                    category === c.value ? "bg-accent-teal" : "bg-card"
                  }`}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it's on the map (optional)" maxLength={500} />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1">
                {busy ? "Pinning…" : "Pin it"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {error && (
          <p className="border-2 border-ink bg-accent-yellow px-3 py-2 text-sm font-bold">{error}</p>
        )}
      </div>

      {/* Pin index */}
      {pins.length > 0 && (
        <ul className="space-y-2">
          {pins.map((pin) => (
            <li key={pin.id} className="brutal-card flex items-center gap-3 p-3">
              <span className="text-xl">{pinEmoji(pin.category)}</span>
              <button
                type="button"
                onClick={() => focusPin(pin)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate font-bold leading-snug">{pin.name}</p>
                <p className="truncate font-mono text-xs text-ink/50">
                  {pin.note ?? pin.address ?? `${pin.lat.toFixed(3)}, ${pin.lng.toFixed(3)}`}
                  {" · "}
                  {pin.creatorName}
                </p>
              </button>
              {pin.canDelete && (
                <button
                  onClick={() => deletePin(pin.id)}
                  className="brutal-press shrink-0 border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
