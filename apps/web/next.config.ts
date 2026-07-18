import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ph/shared se publica como TypeScript crudo (sin build step). Next debe
  // transpilarlo igual que el código de la app, sino el build de Vercel falla
  // al ver .ts del workspace. Ver AGENTS.md (monorepo).
  transpilePackages: ["@ph/shared"],
  // sharp trae binario nativo; si Next lo bundlea, el require del .node falla en la
  // función de Vercel. Externalizarlo lo deja resolver desde node_modules en runtime.
  serverExternalPackages: ["sharp"],
  // Los .ttf del catálogo tipográfico se leen con fs.readFileSync en runtime (Satori).
  // nft no los rastrea (no son imports), así que hay que incluirlos explícitamente o el
  // bundle serverless de Vercel se queda sin fuentes → tofu. Los devices son componentes
  // .tsx (imports normales) y no necesitan esto. Ver migration/fases/00-composicion.md.
  outputFileTracingIncludes: {
    "/api/generador-landing/**": ["./lib/landing/fonts/**"],
  },
};

export default nextConfig;
