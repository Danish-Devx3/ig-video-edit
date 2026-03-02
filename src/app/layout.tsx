import { Metadata } from "next";
import { DM_Sans as FontSans } from "next/font/google";

import { Navbar, Footer } from "@/components/layout";
import { AdSense } from "@/components/adsense/AdSense";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ReactQueryProvider } from "@/components/providers/react-query-provider";

import { cn } from "@/lib/utils";

import "./globals.css";


const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Instagram Video Downloader",
  description: "Download Instagram Videos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full overflow-hidden">
      <head>
        <AdSense pId="9504654793147997" />
      </head>
      <body
        className={cn(
          fontSans.variable,
          "h-full overflow-hidden bg-background font-sans antialiased flex flex-col"
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ReactQueryProvider>
            {/* Navbar — fixed height, never shrinks */}
            <Navbar />
            {/* Main — takes all remaining height, clips overflow */}
            <main className="flex-1 min-h-0 overflow-hidden">
              {children}
            </main>
            {/* Footer — fixed height, never shrinks */}
            <Footer />
          </ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
