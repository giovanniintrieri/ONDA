import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Onda — La tua musica, in locale",
  applicationName: "Onda",
  appleWebApp: { capable: true, title: "Onda", statusBarStyle: "black-translucent" },
  description: "Ascolta e organizza i tuoi file musicali. Scopri il prossimo brano con suggerimenti che imparano dai tuoi ascolti, sul tuo dispositivo.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-192.png",
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#141615', viewportFit: 'cover' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="dark">
      <head><link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
