/**
 * Crash multiplier curve — a pure function of elapsed milliseconds.
 * Computed identically on client (animation) and server (settlement).
 * m(0) = 1.00, grows exponentially at 14% per second.
 */
export function multiplierAt(elapsedMs: number): number {
  const t = Math.max(0, elapsedMs) / 1000; // seconds
  const m = Math.pow(Math.E, 0.14 * t); // accelerating curve, m(0)=1
  return Math.floor(m * 100) / 100; // 2-decimal floor
}
