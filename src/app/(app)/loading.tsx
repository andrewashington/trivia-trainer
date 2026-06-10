/**
 * Route-transition loading state: the logo letters do a little wave
 * and a row of pixel blocks marches underneath. Brutalist, bouncy,
 * gone in a blink on fast loads.
 */
const LETTERS = [
  { ch: "U", color: "text-accent-red" },
  { ch: "D", color: "text-accent-yellow" },
  { ch: "M", color: "text-accent-blue" },
  { ch: "+", color: "text-accent-green" },
];

const BLOCKS = ["bg-accent-red", "bg-accent-yellow", "bg-accent-blue", "bg-accent-green", "bg-accent-pink", "bg-accent-cyan"];

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <div className="flex items-baseline font-display text-6xl font-bold leading-none">
        {LETTERS.map(({ ch, color }, i) => (
          <span
            key={ch}
            aria-hidden
            className={`inline-block animate-hop ${color} drop-shadow-[4px_4px_0_#101010] [-webkit-text-stroke:2px_#101010]`}
            style={{ animationDelay: `${i * 120}ms` }}
          >
            {ch}
          </span>
        ))}
      </div>
      <div className="flex gap-1.5 border-3 border-ink bg-card p-2 shadow-brutal">
        {BLOCKS.map((bg, i) => (
          <span
            key={i}
            className={`h-4 w-4 animate-blockblink border-2 border-ink ${bg}`}
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </div>
      <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-ink/50">
        Loading the goods
      </p>
    </div>
  );
}
