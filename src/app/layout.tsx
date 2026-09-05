import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "app8n — local-first agentic automation",
  description:
    "Chat-driven, zero-code automation for Google Workspace. Runs on your machine.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
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
  colorScheme: "dark",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // `dark` is in the server-rendered markup so the very first paint is
      // dark; next-themes swaps the class afterwards if the user picks light.
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // next-themes writes the class on <html> before paint; without this
      // React warns about the server/client mismatch it deliberately creates.
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background text-foreground">
        <Providers>
          <AppShell>{children}</AppShell>
          <Toaster richColors position="top-center" />
        </Providers>
      </body>
    </html>
  );
}
