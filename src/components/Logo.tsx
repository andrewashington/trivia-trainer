/**
 * The UDM+ wordmark: chunky multicolor letters with a hard black
 * extrusion and per-letter tilt — retro N64-logo energy, rendered in
 * pure CSS so it scales anywhere.
 */
const LETTERS: { ch: string; color: string; tilt: string }[] = [
  { ch: "U", color: "text-accent-red", tilt: "-rotate-3" },
  { ch: "D", color: "text-accent-yellow", tilt: "rotate-2" },
  { ch: "M", color: "text-accent-blue", tilt: "-rotate-2" },
  { ch: "+", color: "text-accent-green", tilt: "rotate-3" },
];

export function Logo({ size = "md" }: { size?: "sm" | "md" | "xl" }) {
  const sizeClass =
    size === "xl" ? "text-7xl sm:text-8xl" : size === "md" ? "text-4xl" : "text-2xl";
  const shadow =
    size === "sm"
      ? "drop-shadow-[2px_2px_0_#101010]"
      : "drop-shadow-[4px_4px_0_#101010]";

  return (
    <span
      aria-label="UDM+"
      className={`inline-flex select-none items-baseline font-display font-bold leading-none ${sizeClass}`}
    >
      {LETTERS.map(({ ch, color, tilt }, i) => (
        <span
          key={i}
          aria-hidden
          className={`inline-block ${color} ${tilt} ${shadow} [-webkit-text-stroke:2px_#101010] ${
            size === "sm" ? "[-webkit-text-stroke-width:1.5px]" : ""
          }`}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}
