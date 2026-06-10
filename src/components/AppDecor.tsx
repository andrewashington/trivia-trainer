import { ConfettiShape, type ConfettiShapeKind } from "@/components/Confetti";

/**
 * Ambient floating shapes in the empty gutters either side of the
 * centered app shell — the same brutalist confetti as the sign-in
 * splash, but confined to the margins so they never sit under content.
 *
 * Mounted once in the app layout, so the shapes persist (and keep
 * bobbing) across page navigations instead of respawning each route.
 * The gutter columns are sized to exactly the space outside the
 * max-w-6xl (72rem) shell and clipped, so on narrower screens — where
 * there's no gutter — they collapse to nothing and show nothing.
 * Decorative only: pointer-events-none, low z (below the feedback
 * button and any overlays), aria-hidden.
 */
type Decor = {
  shape: ConfettiShapeKind;
  color: string;
  top: string;
  // Horizontal spot within the gutter, measured from the inner edge
  // (the edge nearest the content).
  inset: string;
  size: number;
  dur: number;
  delay: number;
  rot: number;
};

const LEFT: Decor[] = [
  { shape: "square", color: "bg-accent-red", top: "16%", inset: "30%", size: 34, dur: 4.4, delay: 0, rot: -8 },
  { shape: "ring", color: "bg-accent-indigo", top: "38%", inset: "55%", size: 28, dur: 5.2, delay: 0.6, rot: 0 },
  { shape: "plus", color: "text-accent-green", top: "60%", inset: "35%", size: 40, dur: 3.9, delay: 0.3, rot: 10 },
  { shape: "diamond", color: "bg-accent-yellow", top: "82%", inset: "50%", size: 26, dur: 4.8, delay: 0.9, rot: 0 },
];

const RIGHT: Decor[] = [
  { shape: "ring", color: "bg-accent-blue", top: "12%", inset: "40%", size: 32, dur: 5.0, delay: 0.4, rot: 6 },
  { shape: "plus", color: "text-accent-grape", top: "34%", inset: "30%", size: 38, dur: 4.2, delay: 0.1, rot: -12 },
  { shape: "square", color: "bg-accent-teal", top: "56%", inset: "52%", size: 28, dur: 5.5, delay: 0.8, rot: 12 },
  { shape: "diamond", color: "bg-accent-magenta", top: "78%", inset: "32%", size: 30, dur: 4.0, delay: 0.5, rot: 0 },
];

const GUTTER_WIDTH = "max(0px, calc((100vw - 72rem) / 2))";

export function AppDecor() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 hidden xl:block">
      <Gutter side="left" shapes={LEFT} />
      <Gutter side="right" shapes={RIGHT} />
    </div>
  );
}

function Gutter({ side, shapes }: { side: "left" | "right"; shapes: Decor[] }) {
  return (
    <div
      className="absolute top-0 h-full overflow-hidden"
      style={{ width: GUTTER_WIDTH, [side]: 0 }}
    >
      {shapes.map((s, i) => (
        <span
          key={i}
          className="absolute"
          style={{ top: s.top, [side]: s.inset, transform: `rotate(${s.rot}deg)` }}
        >
          <span
            className="block animate-float"
            style={{ animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
          >
            <ConfettiShape shape={s.shape} color={s.color} size={s.size} />
          </span>
        </span>
      ))}
    </div>
  );
}
