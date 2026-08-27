/**
 * Chandler-mode transformer.
 *
 * Replaces every "l" with "r" (preserving case: L → R). Mentions, custom
 * emoji, URLs, and code spans are frozen first so we never rewrite inside them.
 */

const TOKEN_RE =
  /```[\s\S]*?```|`[^`]+`|<a?:\w+:\d+>|<#\d+>|<@!?\d+>|<@&\d+>|https?:\/\/\S+/g;

function protect(text: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const next = text.replace(TOKEN_RE, (m) => {
    const i = tokens.length;
    tokens.push(m);
    return `@@CH${i}@@`;
  });
  return { text: next, tokens };
}

function restore(text: string, tokens: string[]): string {
  return text.replace(/@@CH(\d+)@@/g, (_, n) => tokens[Number(n)] ?? "");
}

/**
 * Swap every l/L for r/R. Empty / whitespace-only input is returned unchanged.
 */
export function chandlerify(text: string): string {
  if (!text.trim()) return text;

  const { text: frozen, tokens } = protect(text);
  const out = frozen.replace(/l/gi, (ch) => (ch === "L" ? "R" : "r"));
  return restore(out, tokens).slice(0, 2000);
}
