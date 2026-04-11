import type { Metadata } from "next";
import "./globals.css";

const deployOrigin = (process.env.NEXT_PUBLIC_DEPLOY_ORIGIN || "").replace(
  /\/$/,
  "",
);

export const metadata: Metadata = {
  title: "Token Color Editor — Design Token HSL Tuner",
  description: "Upload your CSS design tokens, visually edit colors with HSL sliders, and export the updated file. A browser-based tool for design system color management.",
  icons: {
    // Production: absolute URL so it works from /storybook/ and from github.io/<repo>/.
    // Dev: site-root path so /storybook/ still resolves to localhost favicon.
    icon: deployOrigin ? `${deployOrigin}/favicon.ico` : "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
