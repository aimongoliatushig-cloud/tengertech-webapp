import type { Metadata } from "next";
import { Exo_2, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import "./globals.css";

const display = Exo_2({
  variable: "--font-display",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
});

const body = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Хот тохижилтын удирдлагын төв",
  description: "Odoo ERP дээр суурилсан хотын ажиллагааны хяналтын самбар",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="mn"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
