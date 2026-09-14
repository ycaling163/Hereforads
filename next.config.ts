import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 默认 1MB 太小,发布广告位时要传图片,调大一点(多张图合计上限)。
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
