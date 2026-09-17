import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
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
  metadataBase: new URL("https://hereforads.com"),
  title: {
    default: "HereForAds — Turn Your Space Into Ad Space",
    template: "%s | HereForAds",
  },
  description:
    "HereForAds is a marketplace where creators and everyday people list their physical or digital space as ad placements, and brands find and book the right spot to advertise.",
  openGraph: {
    title: "HereForAds — Turn Your Space Into Ad Space",
    description:
      "List your space and get paid by brands, or browse ad placements — from creator bio-links to real-world walls and desks.",
    url: "https://hereforads.com",
    siteName: "HereForAds",
    images: ["/logo.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-zinc-900">
        <Header />
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
