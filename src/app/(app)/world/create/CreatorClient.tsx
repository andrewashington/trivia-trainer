"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import type { AvatarConfig, PartsManifest } from "@/modules/world/avatar";
import { partPaths } from "@/modules/world/avatar";

/**
 * Character creator UI. Pure DOM — the preview renders the actual part
 * sheets as stacked, pixelated background-images stepping through the
 * 6-frame idle/walk cycles, so what you see is exactly what the game
 * composites.
 *
 * Sheet grid (verified): 16x32 frames, 56 cols; row 1 = idle, row 2 =
 * walk; direction order right, up, left, down (6 frames each).
 */

const ASSET_BASE = "/api/world/assets";
const FRAME_W = 16;
const FRAME_H = 32;
const SCALE = 6;
const DIRS = [
  { key: "down", label: "front", col0: 18 },
  { key: "left", label: "left", col0: 12 },
  { key: "right", label: "right", col0: 0 },
  { key: "up", label: "back", col0: 6 },
] as const;

function defaultConfig(m: PartsManifest): AvatarConfig {
  const hairStyle = Object.keys(m.hairstyles)[0];
  const outfitStyle = Object.keys(m.outfits)[0];
  return {
    body: m.bodies[0],
    eyes: m.eyes[0],
    hair: { style: hairStyle, color: m.hairstyles[hairStyle][0] },
    outfit: { style: outfitStyle, color: m.outfits[outfitStyle][0] },
  };
}

/** stepper row: ‹ label i/n › */
function Stepper({
  label,
  index,
  count,
  onStep,
}: {
  label: string;
  index: number;
  count: number;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="brutal-label !mb-0 w-20 shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" className="!px-2.5 !py-0.5" onClick={() => onStep(-1)}>
          ‹
        </Button>
        <span className="w-14 text-center font-mono text-xs font-bold">
          {index + 1} / {count}
        </span>
        <Button type="button" variant="ghost" className="!px-2.5 !py-0.5" onClick={() => onStep(1)}>
          ›
        </Button>
      </div>
    </div>
  );
}

export function CreatorClient({
  initialConfig,
  ownedOutfits = {},
}: {
  initialConfig: AvatarConfig | null;
  /** Purchased outfit styles → colors, merged into the starter manifest. */
  ownedOutfits?: Record<string, string[]>;
}) {
  const router = useRouter();
  const [manifest, setManifest] = useState<PartsManifest | null>(null);
  const [config, setConfig] = useState<AvatarConfig | null>(initialConfig);
  const [dirIdx, setDirIdx] = useState(0);
  const [walking, setWalking] = useState(false);
  const [frameCol, setFrameCol] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${ASSET_BASE}/character-parts/manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error("Couldn't load the wardrobe.");
        return r.json();
      })
      .then((m: PartsManifest) => {
        const merged = { ...m, outfits: { ...m.outfits, ...ownedOutfits } };
        setManifest(merged);
        setConfig((c) => c ?? defaultConfig(merged));
      })
      .catch((e) => setError(e.message));
    // ownedOutfits is a server-rendered constant for the page's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 6-frame animation loop (idle ~6fps, walk ~10fps)
  useEffect(() => {
    const t = setInterval(() => setFrameCol((f) => (f + 1) % 6), walking ? 100 : 165);
    return () => clearInterval(t);
  }, [walking]);

  const layers = useMemo(() => (config ? partPaths(config) : []), [config]);

  const cycle = useCallback(
    (list: string[], current: string, delta: number) =>
      list[(list.indexOf(current) + delta + list.length) % list.length],
    []
  );

  // Full-card error only when the wardrobe itself failed to load;
  // save errors render inline next to the button instead.
  if (error && (!manifest || !config)) {
    return (
      <Card>
        <p className="font-bold text-accent-red">{error}</p>
        <p className="mt-1 text-sm text-ink/60">
          The character parts may not be synced — ping the management.
        </p>
      </Card>
    );
  }
  if (!manifest || !config) {
    return <div className="h-80 animate-pulse border-3 border-ink bg-card" />;
  }

  const dir = DIRS[dirIdx];
  const row = walking ? 2 : 1;
  const bgX = -(dir.col0 + frameCol) * FRAME_W;
  const bgY = -row * FRAME_H;

  const hairStyles = Object.keys(manifest.hairstyles);
  const hairColors = config.hair ? manifest.hairstyles[config.hair.style] : [];
  const outfitStyles = Object.keys(manifest.outfits);
  const outfitColors = manifest.outfits[config.outfit.style];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/world/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Save failed.");
      }
      router.push("/world");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* ── Preview ── */}
      <Card className="flex flex-col items-center gap-4">
        <div
          className="border-3 border-ink bg-accent-green/30"
          style={{ width: FRAME_W * SCALE, height: FRAME_H * SCALE, position: "relative", overflow: "hidden" }}
        >
          {layers.map((p) => (
            <div
              key={p}
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `url(${ASSET_BASE}/${p})`,
                backgroundPosition: `${bgX * SCALE}px ${bgY * SCALE}px`,
                backgroundSize: `${56 * FRAME_W * SCALE}px auto`,
                backgroundRepeat: "no-repeat",
                imageRendering: "pixelated",
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="!px-2.5 !py-0.5 !text-xs"
            onClick={() => setDirIdx((d) => (d + 1) % DIRS.length)}
          >
            ↻ {dir.label}
          </Button>
          <Button
            type="button"
            variant={walking ? "green" : "ghost"}
            className="!px-2.5 !py-0.5 !text-xs"
            onClick={() => setWalking((w) => !w)}
          >
            {walking ? "walking" : "standing"}
          </Button>
        </div>
      </Card>

      {/* ── Pickers ── */}
      <Card className="space-y-4">
        <Stepper
          label="Skin"
          index={manifest.bodies.indexOf(config.body)}
          count={manifest.bodies.length}
          onStep={(d) => setConfig({ ...config, body: cycle(manifest.bodies, config.body, d) })}
        />
        <Stepper
          label="Eyes"
          index={manifest.eyes.indexOf(config.eyes)}
          count={manifest.eyes.length}
          onStep={(d) => setConfig({ ...config, eyes: cycle(manifest.eyes, config.eyes, d) })}
        />
        <Stepper
          label="Hair"
          index={config.hair ? hairStyles.indexOf(config.hair.style) + 1 : 0}
          count={hairStyles.length + 1}
          onStep={(d) => {
            // position 0 = bald; 1..n = styles
            const pos = config.hair ? hairStyles.indexOf(config.hair.style) + 1 : 0;
            const next = (pos + d + hairStyles.length + 1) % (hairStyles.length + 1);
            setConfig({
              ...config,
              hair:
                next === 0
                  ? null
                  : {
                      style: hairStyles[next - 1],
                      color: config.hair?.color && manifest.hairstyles[hairStyles[next - 1]].includes(config.hair.color)
                        ? config.hair.color
                        : manifest.hairstyles[hairStyles[next - 1]][0],
                    },
            });
          }}
        />
        {config.hair && (
          <Stepper
            label="Hair color"
            index={hairColors.indexOf(config.hair.color)}
            count={hairColors.length}
            onStep={(d) =>
              setConfig({
                ...config,
                hair: { ...config.hair!, color: cycle(hairColors, config.hair!.color, d) },
              })
            }
          />
        )}
        <Stepper
          label="Outfit"
          index={outfitStyles.indexOf(config.outfit.style)}
          count={outfitStyles.length}
          onStep={(d) => {
            const style = cycle(outfitStyles, config.outfit.style, d);
            const colors = manifest.outfits[style];
            setConfig({
              ...config,
              outfit: { style, color: colors.includes(config.outfit.color) ? config.outfit.color : colors[0] },
            });
          }}
        />
        <Stepper
          label="Variant"
          index={outfitColors.indexOf(config.outfit.color)}
          count={outfitColors.length}
          onStep={(d) =>
            setConfig({ ...config, outfit: { ...config.outfit, color: cycle(outfitColors, config.outfit.color, d) } })
          }
        />

        {error && <p className="font-bold text-accent-red">{error}</p>}
        <div className="flex items-center gap-3 pt-1">
          <Button type="button" variant="yellow" disabled={saving} onClick={save}>
            {saving ? "Compositing…" : initialConfig ? "Update look" : "Enter the world"}
          </Button>
          <p className="font-mono text-[10px] text-ink/40">
            accessories sold separately. literally — store coming soon.
          </p>
        </div>
      </Card>
    </div>
  );
}
