/**
 * A single brutalist confetti shape — a bordered, hard-shadowed square,
 * ring, diamond, or chunky plus in a module accent color. Shared by the
 * sign-in splash (SignInDecor) and the in-app gutter decor (AppDecor).
 */
export type ConfettiShapeKind = "square" | "ring" | "plus" | "diamond";

export function ConfettiShape({
  shape,
  color,
  size,
}: {
  shape: ConfettiShapeKind;
  color: string;
  size: number;
}) {
  if (shape === "plus") {
    return (
      <span
        className={`font-display font-bold leading-none drop-shadow-[3px_3px_0_#101010] [-webkit-text-stroke:2px_#101010] ${color}`}
        style={{ fontSize: size }}
      >
        +
      </span>
    );
  }
  const base = `block border-3 border-ink shadow-brutal ${color}`;
  if (shape === "ring") {
    return <span className={`rounded-full ${base}`} style={{ width: size, height: size }} />;
  }
  if (shape === "diamond") {
    return <span className={`rotate-45 ${base}`} style={{ width: size, height: size }} />;
  }
  return <span className={base} style={{ width: size, height: size }} />;
}
