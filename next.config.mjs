/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    // Keep server bundles lean for the Docker standalone output.
    serverComponentsExternalPackages: ["@prisma/client", "nodemailer"],
  },
};

export default nextConfig;
