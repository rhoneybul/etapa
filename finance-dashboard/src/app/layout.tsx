import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Etapa Finance",
  description: "Founder-facing finance dashboard.",
  robots: { index: false, follow: false },  // never let search engines in
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
