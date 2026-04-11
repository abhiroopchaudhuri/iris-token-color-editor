import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token Color Editor — Design Token HSL Tuner",
  description: "Upload your CSS design tokens, visually edit colors with HSL sliders, and export the updated file. A browser-based tool for design system color management.",
  icons: {
    icon: '/favicon.ico',
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
