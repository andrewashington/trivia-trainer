/**
 * Uwu-speak transformer.
 *
 * Letter rules adapted from warriordog/discord-uwu-bot (MIT,
 * Copyright 2023 Hazel Koehler): r→w, optional ny/fw insertions,
 * optional cute curses. We differ on purpose: `ll` becomes `w` (hello → hewo)
 * instead of the upstream `wl`, leftover `l` also becomes `w`, and intensity
 * is a 1–3 level instead of a pair of booleans.
 *
 * Mentions, custom emoji, and URLs are frozen before substitution so pings
 * and links still work.
 */

export type UwuLevel = 1 | 2 | 3;

const TOKEN_RE = /<a?:\w+:\d+>|<#\d+>|<@!?\d+>|<@&\d+>|https?:\/\/\S+/g;

function matchCase(pattern: string, replacement: string): string {
  const n = Math.min(pattern.length, replacement.length);
  let out = "";
  for (let i = 0; i < n; i++) {
    out += pattern[i] === pattern[i].toUpperCase() ? replacement[i].toUpperCase() : replacement[i].toLowerCase();
  }
  if (replacement.length > n) out += replacement.slice(n);
  return out;
}

function protect(text: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const next = text.replace(TOKEN_RE, (m) => {
    const i = tokens.length;
    tokens.push(m);
    return `@@UWU${i}@@`;
  });
  return { text: next, tokens };
}

function restore(text: string, tokens: string[]): string {
  return text.replace(/@@UWU(\d+)@@/g, (_, n) => tokens[Number(n)] ?? "");
}

function replaceCI(text: string, pattern: RegExp, replacement: string): string {
  return text.replace(pattern, (m) => matchCase(m, replacement));
}

function stutterFirstWord(text: string): string {
  return text.replace(/^(\s*)(?!@@UWU)([A-Za-z])([A-Za-z]{1,})/, "$1$2-$2$3");
}

/**
 * Transform English-ish Discord message content into uwu-speak at `level`.
 * Empty / whitespace-only input is returned unchanged.
 */
export function uwuify(text: string, level: UwuLevel): string {
  if (!text.trim()) return text;

  const { text: frozen, tokens } = protect(text);
  let out = frozen;

  // Core lisp (all levels). `ll` first so "hello" → "hewo", not "hewwo".
  out = replaceCI(out, /ll/gi, "w");
  out = replaceCI(out, /r/gi, "w");
  out = replaceCI(out, /l/gi, "w");

  if (level >= 2) {
    out = out.replace(/(n)([aeiou])/gi, (_, n: string, v: string) => n + matchCase(v, "y") + v);
    out = out.replace(/(f)([aeiou])/gi, (_, f: string, v: string) => f + matchCase(v, "w") + v);
    out = out.replace(/([aeiou])(d)/gi, (_, v: string, d: string) => v + matchCase(d, "w") + d);

    out = out.replace(/(f|b|sh)(uck|itch|it)/gi, (_, start: string, end: string) => start + matchCase(end, "w") + end);
    out = out.replace(/(d)(amn)/gi, (_, start: string, end: string) => start + matchCase(end, "y") + end);

    out = stutterFirstWord(out);
    if (level === 2) {
      out = out.replace(/\s*$/, " uwu");
    } else {
      out = out.replace(/\s*$/, " owo UwU!");
    }
  }

  out = restore(out, tokens);
  return out.slice(0, 2000);
}

export function parseUwuLevel(value: string | undefined): UwuLevel | "off" | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "off" || v === "0") return "off";
  if (v === "1" || v === "2" || v === "3") return Number(v) as UwuLevel;
  return null;
}
