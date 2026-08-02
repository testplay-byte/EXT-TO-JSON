import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-f1843bd5-57ba-4783-9e8a-e4bad0369643.space-z.ai",
    "*.space-z.ai",
  ],
};

export default nextConfig;
