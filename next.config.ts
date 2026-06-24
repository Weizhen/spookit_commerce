import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The A2A MCP endpoint streams responses; keep server actions/body limits sane.
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Product images in the catalog can come from arbitrary owner-supplied URLs in
  // the demo. Allow remote images broadly; tighten before any commercial launch.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
