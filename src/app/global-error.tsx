"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors in the root layout itself, so it
 * must render its own <html>/<body>. Intentionally dependency-free
 * (no Tailwind classes guaranteed) — inline styles only.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[UDM+ fatal]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F4F1EA",
          fontFamily: "Helvetica, Arial, sans-serif",
          color: "#101010",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            border: "3px solid #101010",
            background: "#fff",
            boxShadow: "6px 6px 0 #101010",
            padding: 32,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 48, fontWeight: 800, margin: 0 }}>×_×</p>
          <h1 style={{ fontSize: 22, margin: "12px 0 4px" }}>UDM+ hit a snag</h1>
          <p style={{ fontSize: 14, color: "#10101099", margin: 0 }}>
            The whole app failed to load. Try reloading.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#10101080", marginTop: 12 }}>ref: {error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              border: "3px solid #101010",
              background: "#2563FF",
              color: "#fff",
              fontWeight: 700,
              textTransform: "uppercase",
              padding: "10px 20px",
              boxShadow: "4px 4px 0 #101010",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
