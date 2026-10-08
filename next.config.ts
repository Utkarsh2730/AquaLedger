import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Every page is client-rendered against AppSync, so ship a static site: Amplify Hosting
  // serves it from its CDN with no SSR compute charges.
  output: "export",
  trailingSlash: true,
  // Each script gets its own build folder (see package.json): running `npm run dev`, `npm run demo`
  // and `npm run build` at the same time would otherwise overwrite each other's .next folder and
  // break the running server with ENOENT / 500 errors.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
