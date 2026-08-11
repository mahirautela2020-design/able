import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "@sparticuz/chromium", "playwright-core"],
};

export default nextConfig;
