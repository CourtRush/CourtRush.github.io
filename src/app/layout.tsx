import type { Metadata, Viewport } from "next";
import "./legacy.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "CourtRush",
  applicationName: "CourtRush",
  description: "Rush the court. Rule the game.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/courtrush-icon.svg", type: "image/svg+xml" },
      { url: "/courtrush-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/courtrush-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/courtrush-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "CourtRush",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0E5F58",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-build="courtrush-next-versioned" data-theme="light" style={{ colorScheme: "light" }}>
      <body>{children}</body>
    </html>
  );
}
