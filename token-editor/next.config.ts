import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/** Strip trailing slash; empty if unset. */
const deployOrigin = (process.env.NEXT_PUBLIC_DEPLOY_ORIGIN || "").replace(
  /\/$/,
  "",
);

const nextConfig: NextConfig = {
  trailingSlash: true,
  // Static export only for production (GitHub Pages)
  ...(isProd ? { output: "export" } : {}),
  // No basePath: paths resolve relative to the page URL so the same export works on
  // github.io/<repo>/… and on a custom apex domain at /.
  // Load Next chunks from NEXT_PUBLIC_DEPLOY_ORIGIN (canonical site URL, no trailing slash).
  ...(isProd && deployOrigin ? { assetPrefix: deployOrigin } : {}),
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
