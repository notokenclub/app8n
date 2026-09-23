import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "app8n — local-first agentic automation",
  description:
    "Chat-driven, zero-code automation for Google Workspace. Runs on your machine.",
  appleWebApp: { capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // `cover` is what makes env(safe-area-inset-*) report real values instead of
  // zero, so the tab bar can clear the home indicator and the header can clear
  // the notch. Without it the layout is letterboxed on a modern iPhone.
  viewportFit: "cover",
  // Pinch-zoom on a chat surface only ever fires by accident mid-scroll.
  userScalable: false,
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The design system is canvas-first: warm white surface, flame accent.
      // next-themes swaps in the charcoal theme afterwards if the user picks
      // it. Fonts come from the system's own @font-face sheet, so no font
      // loader variable is needed on <html>.
      className="h-full antialiased"
      // next-themes writes the class on <html> before paint; without this
      // React warns about the server/client mismatch it deliberately creates.
      suppressHydrationWarning
    >
      <head>
        {/* Manrope is the product's UI face and JetBrains Mono its monospace;
            both come from the Google Fonts CDN (no brand files were supplied
            for either). Preconnecting shaves a round trip off first paint.
            The Cabin families are self-hosted from /public/fonts. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* The rule this disables is a pages-router heuristic: a <link> in the
            App Router's root layout is on every page, which is exactly what a
            brand font needs. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-dvh bg-background text-foreground">
        <Providers>
          <AppShell>{children}</AppShell>
          <Toaster richColors position="top-center" />
        </Providers>
      </body>
    </html>
  );
}
