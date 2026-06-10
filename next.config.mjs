/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Type errors still fail the build (we keep `tsc` green); a stray lint
  // warning shouldn't block a friend-group deploy.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Keep server bundles lean for the Docker standalone output.
    serverComponentsExternalPackages: ["@prisma/client", "nodemailer"],
    // Boots the Discord outbox drainer (src/instrumentation.ts).
    instrumentationHook: true,
  },
};

export default nextConfig;
