import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

/**
 * Space Grotesk for headings and metric numbers, Inter for UI/body — exposed as
 * CSS variables so `globals.css` can bind them to Tailwind's --font-* namespace
 * rather than components reaching for font classes directly.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Signal — Social performance, decoded",
  description:
    "Multi-tenant social media management for agencies. Facebook and Instagram publishing, analytics and AI insight that shows its reasoning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /**
     * suppressHydrationWarning is required by next-themes: its inline script
     * sets `class="dark"` on <html> before React hydrates, so server and client
     * markup intentionally differ on this one element.
     */
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
