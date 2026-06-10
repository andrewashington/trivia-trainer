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
    throw new Error(
      (data as { error?: string }).error ?? `Request failed (${res.status})`
    );
  }
  // Mutations may have earned coins — let the header badge refetch/animate.
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    window.dispatchEvent(new Event("coins:refresh"));
  }
  return data as T;
}
