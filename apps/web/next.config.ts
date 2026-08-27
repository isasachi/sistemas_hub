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
  serverExternalPackages: ["sharp", "ffmpeg-static"],
  // Y externalizarlo no alcanza para Vercel: el binario es un ARCHIVO DE DATOS que ningún
  // `require` menciona, así que el trazador de dependencias puede no incluirlo en la función.
  // El síntoma sería el mismo ENOENT, pero solo en producción.
  outputFileTracingIncludes: {
    "/api/generador-video-ads/sessions/[id]/concat": ["../../node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
