import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "d20.build Codex Anima",
  description: "A ledger of the living, the lost, and the in-between — character sheets, builder, and dashboard",
};

// Theme bootstrap — runs before React hydrates so we don't get a flash
// of the wrong theme. Reads localStorage, falls back to system preference,
// defaults to light. The `data-theme` attribute on <html> drives the
// CSS variable cascade.
const themeBootstrap = `
(function() {
  try {
    var stored = localStorage.getItem('codex-anima-theme');
    var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
