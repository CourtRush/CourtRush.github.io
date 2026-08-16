import type { Metadata, Viewport } from "next";
import "./legacy.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "CourtRush",
  description: "Rush the court. Rule the game.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/courtrush-icon.svg",
    apple: "/courtrush-icon.svg",
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
