import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EXT-TO-JSON — Anime Extension Converter & Playground",
  description:
    "Convert Aniyomi/Animiru anime-extension APKs into a portable JSON format, then test their full capabilities in a live playground.",
  keywords: [
    "aniyomi",
    "animiru",
    "anime extension",
    "apk to json",
    "extension converter",
    "playground",
  ],
  authors: [{ name: "EXT-TO-JSON" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange={false}
        >
          {children}
          <Toaster />
          <Sonner position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
