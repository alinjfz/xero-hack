import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KISH | Knowledge & Intelligent SME Hub",
  description: "Next.js 16 starter for a Xero-connected SME intelligence platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
