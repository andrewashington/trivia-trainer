/**
 * Reference diagrams for The Key, redrawn from the classic field-guide
 * chart as parametric line art so every option card answers "wait,
 * which one am I?" by picture instead of by vocabulary. Plain black
 * outlines, no fill — matches the brutal sketchbook style.
 */

import type { ReactNode } from "react";

const CX = 30;

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 60 96"
      className="h-20 w-14"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/* ---------- front view (glans, shaft, foreskin, veins, hair) ---------- */

/** Shaft sides from the base (y=88) to the neck (y=38). */
function shaftSides(wTop: number, wBot: number) {
  const wMid = (wTop + wBot) / 2;
  return [
    `M ${CX - wBot} 88 Q ${CX - wMid - 0.5} 62 ${CX - wTop} 38`,
    `M ${CX + wBot} 88 Q ${CX + wMid + 0.5} 62 ${CX + wTop} 38`,
  ];
}

/** Glans outline + corona from the left neck to the right neck. */
function glans(shape: string, wt: number): string[] {
  switch (shape) {
    case "bell": {
      const c = wt + 4;
      return [
        `M ${CX - c} 38 C ${CX - c} 25 ${CX - 6} 14 ${CX} 14 C ${CX + 6} 14 ${CX + c} 25 ${CX + c} 38`,
        `M ${CX - c} 38 Q ${CX} 42 ${CX + c} 38`,
        `M ${CX} 18 v 4`,
      ];
    }
    case "flared": {
      const c = wt + 7;
      return [
        `M ${CX - c} 38 Q ${CX - c + 1} 30 ${CX - wt + 1} 26 C ${CX - wt + 1} 16 ${CX - 4} 13 ${CX} 13 C ${CX + 4} 13 ${CX + wt - 1} 16 ${CX + wt - 1} 26 Q ${CX + c - 1} 30 ${CX + c} 38`,
        `M ${CX - c} 38 Q ${CX} 42 ${CX + c} 38`,
        `M ${CX} 17 v 4`,
      ];
    }
    case "tapered": {
      const c = wt + 1;
      return [
        `M ${CX - c} 38 C ${CX - c + 2} 26 ${CX - 4} 13 ${CX} 12 C ${CX + 4} 13 ${CX + c - 2} 26 ${CX + c} 38`,
        `M ${CX - c} 38 Q ${CX} 41 ${CX + c} 38`,
        `M ${CX} 16 v 4`,
      ];
    }
    case "mushroom": {
      const c = wt + 9;
      return [
        `M ${CX - c} 36 Q ${CX - c} 17 ${CX} 17 Q ${CX + c} 17 ${CX + c} 36`,
        `M ${CX - c} 36 L ${CX - wt} 39`,
        `M ${CX + c} 36 L ${CX + wt} 39`,
        `M ${CX} 21 v 4`,
      ];
    }
    default: {
      // rounded
      const c = wt + 2;
      return [
        `M ${CX - c} 38 C ${CX - c} 24 ${CX - 8} 15 ${CX} 15 C ${CX + 8} 15 ${CX + c} 24 ${CX + c} 38`,
        `M ${CX - c} 38 Q ${CX} 42 ${CX + c} 38`,
        `M ${CX} 19 v 4`,
      ];
    }
  }
}

function frontView(opts: {
  wTop?: number;
  wBot?: number;
  glansShape?: string;
  veins?: string[];
  hair?: string[];
}): string[] {
  const wTop = opts.wTop ?? 8;
  const wBot = opts.wBot ?? 8;
  return [
    ...shaftSides(wTop, wBot),
    ...glans(opts.glansShape ?? "rounded", wTop),
    ...(opts.veins ?? []),
    ...(opts.hair ?? []),
  ];
}

/* ---------- veins ---------- */

function veinPaths(level: string): string[] {
  const squiggle = (x: number, y: number, h: number) =>
    `M ${x} ${y} q 3 ${h / 3} 0 ${h / 2} q -3 ${h / 4} 0 ${h / 2}`;
  switch (level) {
    case "subtle":
      return [squiggle(28, 52, 18)];
    case "visible":
      return [squiggle(26, 48, 22), squiggle(33, 56, 18)];
    case "prominent":
      return [
        squiggle(26, 44, 26),
        squiggle(33, 50, 24),
        `M 26 57 q 4 2 7 0`,
        `M 28 70 q 3 3 6 1`,
      ];
    default:
      return [];
  }
}

/* ---------- hair ---------- */

function hairPaths(level: string): string[] {
  const curl = (x: number, y: number, s = 1) =>
    `M ${x} ${y} q ${2.5 * s} -3 ${1.5 * s} -5.5 q ${-1.5 * s} -2 ${-3 * s} -0.5`;
  switch (level) {
    case "trimmed":
      return [14, 19, 41, 46].map((x) => `M ${x} 88 v -4`);
    case "natural":
      return [
        curl(12, 90),
        curl(17, 87),
        curl(14, 81, -1),
        curl(43, 90, -1),
        curl(48, 87),
        curl(45, 81),
      ];
    case "wild":
      return [
        curl(10, 92),
        curl(15, 88),
        curl(12, 81, -1),
        curl(17, 75),
        curl(22, 70, -1),
        curl(45, 92, -1),
        curl(50, 88),
        curl(47, 81),
        curl(43, 75, -1),
        curl(38, 70),
      ];
    default:
      return [];
  }
}

/* ---------- foreskin ---------- */

function foreskinPaths(status: string): string[] {
  switch (status) {
    case "uncut_partial":
      // Skin edge riding halfway up the glans, with gather marks.
      return [
        ...frontView({}),
        `M ${CX - 10} 28 Q ${CX} 34 ${CX + 10} 28`,
        `M ${CX - 6} 31 v 3`,
        `M ${CX} 33 v 3`,
        `M ${CX + 6} 31 v 3`,
      ];
    case "uncut_full": {
      // Sides taper to a puckered tip; no glans on show.
      return [
        `M ${CX - 8} 88 Q ${CX - 9} 55 ${CX - 7} 36 Q ${CX - 5} 22 ${CX - 2} 17`,
        `M ${CX + 8} 88 Q ${CX + 9} 55 ${CX + 7} 36 Q ${CX + 5} 22 ${CX + 2} 17`,
        `M ${CX - 2} 17 Q ${CX} 15 ${CX + 2} 17`,
        `M ${CX - 5} 26 q 5 3 10 0`,
        `M ${CX} 17 v -4`,
        `M ${CX - 4} 18 l -2 -3`,
        `M ${CX + 4} 18 l 2 -3`,
      ];
    }
    default:
      // circumcised: clean exposed glans + corona.
      return frontView({});
  }
}

/* ---------- curves (side / leaning views) ---------- */

/** Vertical shaft whose tip drifts `bend` px sideways. */
function bentVertical(bend: number): string[] {
  const b = bend;
  return [
    `M ${CX - 7} 88 Q ${CX - 7 + b * 0.2} 52 ${CX - 7 + b} 24`,
    `M ${CX + 7} 88 Q ${CX + 7 + b * 0.2} 52 ${CX + 7 + b} 24`,
    `M ${CX - 7 + b} 24 Q ${CX + b} 10 ${CX + 7 + b} 24`,
    `M ${CX - 5 + b} 27 Q ${CX + b} 31 ${CX + 5 + b} 27`,
  ];
}

/** Horizontal shaft whose tip drifts `bend` px up (negative) or down. */
function bentHorizontal(bend: number): string[] {
  const b = bend;
  return [
    `M 10 46 Q 32 ${46 + b * 0.25} 48 ${46 + b}`,
    `M 10 62 Q 32 ${62 + b * 0.25} 48 ${62 + b}`,
    `M 48 ${46 + b} Q 58 ${54 + b} 48 ${62 + b}`,
    `M 46 ${49 + b} Q 51 ${54 + b} 46 ${59 + b}`,
    `M 10 46 L 10 62`,
  ];
}

/* ---------- the lookup ---------- */

function pathsFor(field: string, value: string): string[] {
  switch (field) {
    case "glansShape":
      return frontView({ glansShape: value });
    case "shaftProfile":
      switch (value) {
        case "fuller_base":
          return frontView({ wTop: 7, wBot: 12 });
        case "fuller_tip":
          return frontView({ wTop: 11, wBot: 7 });
        case "slim":
          return frontView({ wTop: 5, wBot: 5 });
        default:
          return frontView({});
      }
    case "foreskinStatus":
      return foreskinPaths(value);
    case "pubicHair":
      return frontView({ hair: hairPaths(value) });
    case "veinVisibility":
      return frontView({ veins: veinPaths(value) });
    case "curveVertical":
      // Side view: base at the left, tip bending up or down.
      switch (value) {
        case "up":
          return bentHorizontal(-16);
        case "down":
          return bentHorizontal(16);
        default:
          return bentHorizontal(0);
      }
    case "curveLateral":
      // Bird's-eye-ish front view: tip drifting left or right.
      switch (value) {
        case "left":
          return bentVertical(-18);
        case "right":
          return bentVertical(18);
        default:
          return bentVertical(0);
      }
    case "curveIntensity":
      switch (value) {
        case "slight":
          return bentVertical(8);
        case "moderate":
          return bentVertical(16);
        case "pronounced":
          return bentVertical(26);
        default:
          return bentVertical(0);
      }
    default:
      return [];
  }
}

export function OptionArt({ field, value }: { field: string; value: string }) {
  return (
    <Svg>
      {pathsFor(field, value).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </Svg>
  );
}
