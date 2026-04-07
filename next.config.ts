import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  rewrites: async () => [
    {
      source: '/ws/:path*',
      destination: 'http://localhost:3001/:path*',
    },
  ],
};

export default nextConfig;
