import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  trailingSlash: true,
  // Static export only for production (GitHub Pages)
  ...(isProd ? { output: "export" } : {}),
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: { unoptimized: true },
  // In dev, proxy /mds-storybook to the storybook dev server
  ...(!isProd
    ? {
        async rewrites() {
          return [
            {
              source: "/mds-storybook",
              destination: "http://localhost:5000/",
            },
            {
              source: "/mds-storybook/:path*",
              destination: "http://localhost:5000/:path*",
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
