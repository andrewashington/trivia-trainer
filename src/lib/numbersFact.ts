// "On this day" fact from the Numbers API (http-only upstream, so this must
// always be fetched server-side). Cached in module memory for 6h per date so
// we make at most one upstream call per day per instance.

export type NumbersFact = { text: string; year: number };

const TTL_MS = 6 * 60 * 60 * 1000;

let cached: { key: string; at: number; fact: NumbersFact | null } | null = null;

export async function onThisDayFact(): Promise<NumbersFact | null> {
  const now = new Date();
  const key = `${now.getMonth() + 1}/${now.getDate()}`;
  if (cached && cached.key === key && Date.now() - cached.at < TTL_MS) {
    return cached.fact;
  }

  let fact: NumbersFact | null = null;
  try {
    const res = await fetch(`http://numbersapi.com/${key}/date?json`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { text?: unknown; year?: unknown };
      if (typeof data.text === "string" && typeof data.year === "number") {
        fact = { text: data.text, year: data.year };
      }
    }
  } catch {
    // Upstream flaky or slow — the home page just skips the line.
  }

  cached = { key, at: Date.now(), fact };
  return fact;
}
