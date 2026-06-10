import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "UDM+", template: "%s · UDM+" },
  description: "The friend-group home base: recipes, events, watching, files.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "UDM+" },
};

export const viewport: Viewport = {
  themeColor: "#F4F1EA",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
        {/* The SW caches /_next/static/ cache-first; in dev those URLs
            aren't content-hashed, so a registered worker serves stale
            chunks after every rebuild. Production-only — and dev
            actively unregisters + purges so affected browsers recover. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              process.env.NODE_ENV === "production"
                ? `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }`
                : `if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())); if (window.caches) { caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))); } }`,
          }}
        />
      </body>
    </html>
  );
}
