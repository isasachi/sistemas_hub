import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ph/shared se publica como TypeScript crudo (sin build step). Next debe
  // transpilarlo igual que el código de la app, sino el build de Vercel falla
  // al ver .ts del workspace. Ver AGENTS.md (monorepo).
  transpilePackages: ["@ph/shared"],
  // sharp trae binario nativo; si Next lo bundlea, el require del .node falla en la
  // función de Vercel. Externalizarlo lo deja resolver desde node_modules en runtime.
  //
  // ⚠️ `ffmpeg-static` ESTÁ ACÁ POR UN FALLO MEDIDO, no por precaución. Resuelve la ruta de
  // su binario con `__dirname`, y al empaquetar Next lo reescribe a `/ROOT`: la ruta de
  // concatenación moría con `spawn /ROOT/node_modules/ffmpeg-static/ffmpeg ENOENT`. El test
  // unitario NO lo ve —vitest no empaqueta— así que solo aparece corriendo la ruta de verdad.
  // ⚠️ `@resvg/resvg-js` está acá por el MISMO motivo y con un fallo medido: trae un binding
  // nativo (.node) y Turbopack corta el build con «non-ecmascript placeable asset». Es la tercera
  // vez que este repo aprende lo mismo — todo paquete con binario nativo se externaliza.
  serverExternalPackages: ["sharp", "ffmpeg-static", "@resvg/resvg-js"],
  // Y externalizarlo no alcanza para Vercel: el binario es un ARCHIVO DE DATOS que ningún
  // `require` menciona, así que el trazador de dependencias puede no incluirlo en la función.
  // El síntoma sería el mismo ENOENT, pero solo en producción.
  outputFileTracingIncludes: {
    "/api/generador-video-ads/sessions/[id]/concat": ["../../node_modules/ffmpeg-static/ffmpeg"],
    // El mismo binario para el render: `tramo.ts` recorta del original el tramo de cada lote
    // (la señal de movimiento que lee Wan). Sin esta línea el trazador deja el binario fuera
    // de ESTA función y el síntoma es un ENOENT que solo aparece en producción — el
    // `spawn /ROOT/node_modules/ffmpeg-static/ffmpeg` que ya se pagó una vez con `concat`.
    "/api/generador-video-ads/sessions/[id]/generate-lotes": ["../../node_modules/ffmpeg-static/ffmpeg"],
    // Los .ttf de la barra de confianza: `resvg` los abre por RUTA en runtime, así que ningún
    // `require` los menciona y el trazador los dejaría fuera de la función. El síntoma sería
    // texto sin fuente SOLO en producción — la misma clase de fallo que el binario de ffmpeg.
    "/api/generador-landing/sessions/[id]/section/[type]": ["./assets/fonts/*.ttf"],
  },
};

export default nextConfig;
