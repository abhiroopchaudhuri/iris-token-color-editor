import type { Metadata } from "next";
import "./globals.css";

const deployOrigin = (process.env.NEXT_PUBLIC_DEPLOY_ORIGIN || "").replace(
  /\/$/,
  "",
);

export const metadata: Metadata = {
  title: "Token Color Editor — Design Token HSL Tuner",
  description: "Upload your CSS design tokens, visually edit colors with HSL sliders, and export the updated file. A browser-based tool for design system color management.",
  ...(deployOrigin ? { metadataBase: new URL(`${deployOrigin}/`) } : {}),
  icons: {
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
