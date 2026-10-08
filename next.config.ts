import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Every page is client-rendered against AppSync, so ship a static site: Amplify Hosting
  // serves it from its CDN with no SSR compute charges.
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
