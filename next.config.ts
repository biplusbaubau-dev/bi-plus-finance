import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Penting untuk Docker: hasil build jadi satu folder mandiri (server.js)
  output: "standalone",

  // Jangan gagalkan build produksi hanya karena lint warning
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },

  // Batasi ukuran foto unit yang di-upload (MB)
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
