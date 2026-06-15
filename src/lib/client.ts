"use client";

/** Tiny client for the internal API: JSON in/out, throws on error. */
export async function api<T = unknown>(
  path: string,
  init?: Omit<RequestInit, "body"> & { body?: unknown }
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; details?: Record<string, string[]> };
    // Zod validation errors ship field-level details — fold the first couple
    // into the message so "Invalid input." actually says which field is wrong.
    const fieldHint = d.details
      ? Object.entries(d.details)
          .map(([f, msgs]) => `${f}: ${msgs?.[0] ?? "invalid"}`)
          .slice(0, 2)
          .join("; ")
      : "";
    const base = d.error ?? `Request failed (${res.status})`;
    throw new Error(fieldHint ? `${base} (${fieldHint})` : base);
  }
  // Mutations may have earned coins — let the header badge refetch/animate.
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    window.dispatchEvent(new Event("coins:refresh"));
  }
  return data as T;
}
