import { PixelIcon } from "@/components/icons";
import { ConfettiShape, type ConfettiShapeKind } from "@/components/Confetti";

/**
 * The sign-in splash's playful backdrop: a dotted-paper texture, a drift
 * of brutalist confetti (squares, rings, pluses) in the module palette,
 * and a marquee ribbon of the app's shelves scrolling along the bottom.
 * Pure decoration — pointer-events-none, sits behind the form, and is
 * hidden from screen readers.
 */
const CONFETTI: {
  shape: ConfettiShapeKind;
  color: string;
  top: string;
  left: string;
  size: number;
  rot: number;
  dur: number;
  delay: number;
}[] = [
  { shape: "square", color: "bg-accent-red", top: "14%", left: "12%", size: 44, rot: -8, dur: 4.2, delay: 0 },
  { shape: "ring", color: "bg-accent-blue", top: "22%", left: "82%", size: 52, rot: 6, dur: 5.1, delay: 0.6 },
  { shape: "plus", color: "text-accent-green", top: "70%", left: "8%", size: 56, rot: 10, dur: 3.8, delay: 0.2 },
  { shape: "diamond", color: "bg-accent-yellow", top: "78%", left: "88%", size: 40, rot: 0, dur: 4.6, delay: 0.9 },
  { shape: "square", color: "bg-accent-magenta", top: "40%", left: "92%", size: 30, rot: 14, dur: 5.4, delay: 0.3 },
  { shape: "ring", color: "bg-accent-orange", top: "85%", left: "40%", size: 34, rot: -6, dur: 4.0, delay: 1.1 },
  { shape: "plus", color: "text-accent-grape", top: "10%", left: "60%", size: 38, rot: -12, dur: 4.9, delay: 0.5 },
  { shape: "square", color: "bg-accent-teal", top: "58%", left: "4%", size: 28, rot: 8, dur: 5.6, delay: 0.8 },
  { shape: "diamond", color: "bg-accent-indigo", top: "30%", left: "6%", size: 32, rot: 0, dur: 4.3, delay: 0.1 },
  { shape: "ring", color: "bg-accent-lime", top: "62%", left: "94%", size: 30, rot: 0, dur: 5.0, delay: 0.7 },
];

const SHELVES = ["Cookbook", "Events", "Polls", "Market", "Map", "Ideas", "Reveal", "Stakes", "Wishlist", "Vault", "Pet"];

export function SignInDecor() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Dotted-paper texture */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: "radial-gradient(#10101014 1.5px, transparent 1.5px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Brutalist confetti */}
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="absolute"
          style={{ top: c.top, left: c.left, transform: `rotate(${c.rot}deg)` }}
        >
          <span
            className="block animate-float"
            style={{ animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
          >
            <ConfettiShape shape={c.shape} color={c.color} size={c.size} />
          </span>
        </span>
      ))}

      {/* Marquee ribbon of the app's shelves */}
      <div className="absolute bottom-8 left-0 right-0 -rotate-1 border-y-3 border-ink bg-accent-blue py-2 shadow-brutal">
        <div className="flex w-max animate-marquee whitespace-nowrap">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex shrink-0 items-center">
              {SHELVES.map((s) => (
                <span
                  key={s}
                  className="flex items-center gap-2 px-5 font-display text-sm font-bold uppercase tracking-widest text-white"
                >
                  {s}
                  <PixelIcon name="sparkles" size={12} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
