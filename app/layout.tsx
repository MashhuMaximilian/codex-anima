import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codex of Souls — D&D 5e",
  description: "Character sheets, builder, and dashboard for D&D 5e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
