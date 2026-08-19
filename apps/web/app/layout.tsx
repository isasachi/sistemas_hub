import type { Metadata, Viewport } from "next";
import "./globals.css";

// El ráster del logotipo (granate pleno, sin alfa) sirve tal cual como icono y
// como og:image: ahí el cuadrado ES el formato. En el chrome no se usa — el
// lockup se compone con <Wordmark> (BRANDBOOK.md §1).
//
// ⚠️ El icono NO se declara acá: `app/icon.png` y `app/apple-icon.png` son
// convenciones de archivo del App Router y Next emite sus <link> solo. Había
// un `app/favicon.ico` del logo anterior y esa convención GANA sobre
// `metadata.icons`, así que declararlo en metadata no habría cambiado la
// pestaña. Se borró el .ico y los dos PNG se generaron del logo nuevo.
export const metadata: Metadata = {
  metadataBase: new URL("https://jr-ai-hub.vercel.app"),
  title: "JR AI Hub — Herramientas de Marketing con IA",
  description:
    "Genera anuncios, videos, branding y landing pages en minutos. Herramientas de IA diseñadas para marcas peruanas.",
  openGraph: {
    images: [{ url: "/brand/logo.png", width: 1101, height: 1100 }],
  },
};

// El granate del logotipo pinta también la barra del navegador en móvil.
export const viewport: Viewport = { themeColor: "#1e0811" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* ⚠️ LAS FUENTES SE PIDEN ACÁ, NO CON @import EN globals.css.
            Turbopack ELIMINA los `@import url(...)` externos al compilar la
            hoja: el CSS servido salía con cero @font-face y todo el sitio caía
            a la serif por defecto del navegador (medido — 'Archivo', 'Bodoni
            Moda' y la vieja 'Poppins' medían exactamente lo mismo que `serif`).
            Un <link> además evita el encadenado de @import, que es
            render-blocking en serie. */}

        {/* El chrome: la didona del logotipo + la grotesca de UI. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,700;6..96,800;6..96,900&family=Archivo:wght@400;500;600;700&display=swap"
        />
        {/* NO es del chrome: es el catálogo tipográfico del CONTENIDO que se
            genera para el cliente (lib/landing/niches.ts asigna Poppins ahí).
            No lo borres al tocar la marca — rompe esas previews. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Lato:wght@400;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Space+Grotesk:wght@500;700&family=Cormorant+Garamond:wght@400;600&family=Libre+Baskerville:wght@400;700&family=Nunito:wght@400;700;800&family=Oswald:wght@500;700&family=Bitter:wght@500;700&display=swap"
        />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
