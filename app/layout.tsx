import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JR AI Hub — Herramientas de Marketing con IA",
  description:
    "Genera anuncios, videos, branding y landing pages en minutos. Herramientas de IA diseñadas para marcas peruanas.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
