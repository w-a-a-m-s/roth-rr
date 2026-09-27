import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import {
  CANONICAL_SITE_URL,
  getSiteUrl,
  homeOgImage,
} from "@/lib/common/site";
import "./globals.css";
import { Providers } from "@/components/Providers";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const title = "Advanced Roth Calculator";
const description =
  "What started as a Roth calculator has now evolved into a toolkit for advanced tax planning and real estate analysis, depreciation included, with every step of the math shown.";
// Absolute custom-domain URL so WhatsApp never follows a *.vercel.app og:image.
const ogImage = homeOgImage();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title,
  description,
  applicationName: "Advanced Roth Calculator",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: CANONICAL_SITE_URL,
    siteName: "Roth RR",
    title,
    description,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage.url],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${hanken.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
