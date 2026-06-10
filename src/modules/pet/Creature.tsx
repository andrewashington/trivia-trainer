import type { PetMood } from "./engine";

/**
 * The Wiggle pet, drawn as a composed pixel critter (body + eyes + mouth
 * + feet, plus derived accessories) on a 64×64 grid. White body with a
 * thick ink outline so it reads as one of the app's brutalist shapes —
 * mood lives in the face and the idle animation, not the silhouette.
 *
 * Presentational and hook-free, so it renders on the server (homepage
 * preview) and the client (interactive pet stage) alike. Continuous idle
 * loops are CSS animations, so reduced-motion users get a still pose.
 */

const INK = "#101010";
const PINK = "#FF6FB5";
const GOLD = "#FFD60A";

// One idle animation per mood (applied to the whole critter). Sad has no
// loop — it just droops, set via the wrapper transform below.
const IDLE: Record<PetMood, string> = {
  thriving: "animate-hop",
  happy: "animate-sway",
  okay: "animate-breathe",
  sleepy: "animate-snooze",
  sad: "",
};

function Eyes({ mood, beloved }: { mood: PetMood; beloved: boolean }) {
  // Shades win over the mood's eyes once the pet is well-loved.
  if (beloved && mood !== "sleepy" && mood !== "sad") {
    return (
      <g stroke={INK} strokeWidth={2.5} strokeLinejoin="round">
        <rect x={19} y={26} width={10} height={8} fill={INK} />
        <rect x={35} y={26} width={10} height={8} fill={INK} />
        <rect x={29} y={28} width={6} height={2.5} fill={INK} stroke="none" />
        <rect x={21} y={28} width={3} height={2} fill="#fff" stroke="none" />
        <rect x={37} y={28} width={3} height={2} fill="#fff" stroke="none" />
      </g>
    );
  }
  // Closed, content lines when sleepy or sad.
  if (mood === "sleepy" || mood === "sad") {
    return (
      <g fill={INK}>
        <rect x={21} y={31} width={7} height={2.5} />
        <rect x={36} y={31} width={7} height={2.5} />
      </g>
    );
  }
  // Bright happy carets when thriving.
  if (mood === "thriving") {
    return (
      <g stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 32 L24.5 27 L28 32" />
        <path d="M36 32 L39.5 27 L43 32" />
      </g>
    );
  }
  // Default: open square eyes with a glint.
  return (
    <g className="fill-box animate-blink">
      <g fill={INK}>
        <rect x={22} y={26} width={6} height={8} />
        <rect x={36} y={26} width={6} height={8} />
      </g>
      <g fill="#fff">
        <rect x={23} y={27} width={2} height={2} />
        <rect x={37} y={27} width={2} height={2} />
      </g>
    </g>
  );
}

function Mouth({ mood }: { mood: PetMood }) {
  if (mood === "thriving") {
    return (
      <g stroke={INK} strokeWidth={2.5} strokeLinejoin="round">
        <rect x={26} y={38} width={12} height={7} fill={INK} />
        <rect x={29} y={42} width={6} height={3} fill={PINK} stroke="none" />
      </g>
    );
  }
  if (mood === "happy") {
    return <path d="M25 39 Q32 46 39 39" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />;
  }
  if (mood === "sad") {
    return <path d="M25 44 Q32 38 39 44" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />;
  }
  if (mood === "sleepy") {
    return <rect x={29} y={41} width={6} height={2} fill={INK} />;
  }
  return <rect x={27} y={41} width={10} height={2.5} fill={INK} />; // okay
}

function Crown() {
  return (
    <path
      d="M17 18 L17 8 L23 13 L32 5 L41 13 L47 8 L47 18 Z"
      fill={GOLD}
      stroke={INK}
      strokeWidth={2.5}
      strokeLinejoin="round"
    />
  );
}

function Antenna() {
  return (
    <g stroke={INK} strokeWidth={2.5} strokeLinejoin="round">
      <rect x={30.5} y={9} width={3} height={9} fill={INK} stroke="none" />
      <circle cx={32} cy={7} r={4} fill={GOLD} />
    </g>
  );
}

export function Creature({
  mood,
  size = 88,
  stage = 0,
  beloved = false,
  reacting = false,
}: {
  mood: PetMood;
  size?: number;
  stage?: number;
  beloved?: boolean;
  /** Patted just now — overrides the idle loop with a squash-and-stretch. */
  reacting?: boolean;
}) {
  // While reacting, the face beams regardless of the underlying mood.
  const face: PetMood = reacting ? "thriving" : mood;
  const anim = reacting ? "animate-squish" : IDLE[mood];
  const droop = mood === "sad" ? "rotate(4deg) translateY(2px)" : undefined;
  const showCheeks = face === "happy" || face === "thriving";

  return (
    <div
      className={anim}
      style={{ width: size, height: size, transformOrigin: "50% 90%", transform: droop }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        {/* accessory behind the head outline */}
        {stage >= 2 && <Crown />}
        {stage === 1 && <Antenna />}

        {/* arms */}
        <g fill="#fff" stroke={INK} strokeWidth={2.5} strokeLinejoin="round">
          <rect x={10} y={32} width={6} height={10} rx={2} />
          <rect x={48} y={32} width={6} height={10} rx={2} />
          {/* feet */}
          <rect x={20} y={49} width={9} height={6} rx={1.5} />
          <rect x={35} y={49} width={9} height={6} rx={1.5} />
          {/* body */}
          <rect x={15} y={17} width={34} height={33} rx={4} />
        </g>

        {showCheeks && (
          <g fill={PINK} opacity={0.85}>
            <circle cx={19} cy={38} r={2.6} />
            <circle cx={45} cy={38} r={2.6} />
          </g>
        )}

        <Eyes mood={face} beloved={beloved} />
        <Mouth mood={face} />

        {/* sparkle aura at the top stage */}
        {stage >= 3 && (
          <g className="animate-sparkle" fill={GOLD} stroke={INK} strokeWidth={1.5}>
            <rect x={7} y={14} width={5} height={5} transform="rotate(45 9.5 16.5)" />
            <rect x={52} y={20} width={4} height={4} transform="rotate(45 54 22)" />
            <rect x={50} y={44} width={5} height={5} transform="rotate(45 52.5 46.5)" />
          </g>
        )}

        {/* floating Zs when asleep */}
        {mood === "sleepy" && (
          <g fill={INK} fontFamily="monospace" fontWeight="bold">
            <text x={46} y={20} fontSize={9} className="animate-zfloat">
              z
            </text>
            <text x={50} y={13} fontSize={7} className="animate-zfloat" style={{ animationDelay: "0.9s" }}>
              z
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
