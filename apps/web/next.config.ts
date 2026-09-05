import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ph/shared se publica como TypeScript crudo (sin build step). Next debe
  // transpilarlo igual que el código de la app, sino el build de Vercel falla
  // al ver .ts del workspace. Ver AGENTS.md (monorepo).
  transpilePackages: ["@ph/shared"],
  // sharp trae binario nativo; si Next lo bundlea, el require del .node falla en la
  // función de Vercel. Externalizarlo lo deja resolver desde node_modules en runtime.
  //
  // ⚠️ `@resvg/resvg-js` está acá por el MISMO motivo y con un fallo medido: trae un binding
  // nativo (.node) y Turbopack corta el build con «non-ecmascript placeable asset». Es la tercera
  // vez que este repo aprende lo mismo — todo paquete con binario nativo se externaliza.
  serverExternalPackages: ["sharp", "@resvg/resvg-js"],
  // El trazador de dependencias no incluye archivos de datos que ningún `require` menciona.
  outputFileTracingIncludes: {
    // Los .ttf de la barra de confianza: `resvg` los abre por RUTA en runtime, así que ningún
    // `require` los menciona y el trazador los dejaría fuera de la función. El síntoma sería
    // texto sin fuente SOLO en producción — la misma clase de fallo que el binario de ffmpeg.
    "/api/generador-landing/sessions/[id]/section/[type]": ["./assets/fonts/*.ttf"],
  },
};

export default nextConfig;
