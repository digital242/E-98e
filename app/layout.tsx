import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "THERMODRAIN ERP",
  description: "Manufacturing ERP for Thermoset Poly Products (I) Pvt Ltd. — FRP manhole covers, gratings, cover blocks and structural products.",
  icons: { icon: "/brand/thermodrain-mark.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2a4572" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
