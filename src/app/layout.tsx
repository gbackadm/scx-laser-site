import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "SCX Laser | Gravação a Laser UV",
  description: "Hero section premium para gravação a Laser UV da SCX Laser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
