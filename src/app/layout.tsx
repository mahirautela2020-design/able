import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://scana11y-nine.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ScanA11y — Accessibility Auditor",
  description: "WCAG 2.2 accessibility auditor. URL auditing, compliance matrix, evidence-first findings.",
  openGraph: {
    title: "ScanA11y — Accessibility Auditor",
    description: "WCAG 2.2 accessibility auditor. URL auditing, compliance matrix, evidence-first findings.",
    url: SITE_URL,
    siteName: "ScanA11y",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ScanA11y — Accessibility Auditor",
    description: "WCAG 2.2 accessibility auditor. URL auditing, compliance matrix, evidence-first findings.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
