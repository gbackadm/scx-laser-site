import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "SCX Laser | Gravação a Laser UV de Precisão",
  description:
    "Gravação a laser UV em brindes, produtos personalizados, plaquetas, tags, peças técnicas, acrílico, vidro e couro sintético.",
  keywords: [
    "gravação a laser UV",
    "SCX Laser",
    "gravação de brindes",
    "gravação em acrílico",
    "gravação em vidro",
    "plaquetas patrimoniais",
    "tags NFC",
    "gravação em couro sintético",
  ],
  openGraph: {
    title: "SCX Laser | Gravação a Laser UV de Precisão",
    description:
      "Soluções em gravação a laser UV para brindes, produtos personalizados e peças técnicas.",
    type: "website",
    locale: "pt_BR",
  },
  icons: {
    icon: "/images/logo-scx-oficial.png",
    shortcut: "/images/logo-scx-oficial.png",
    apple: "/images/logo-scx-oficial.png",
  },
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
