import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import { MobileGate } from "@/components/mobile-gate";
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
        <MobileGate />
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
