import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ph/shared se publica como TypeScript crudo (sin build step). Next debe
  // transpilarlo igual que el código de la app, sino el build de Vercel falla
  // al ver .ts del workspace. Ver AGENTS.md (monorepo).
  transpilePackages: ["@ph/shared"],
  // sharp trae binario nativo; si Next lo bundlea, el require del .node falla en la
  // función de Vercel. Externalizarlo lo deja resolver desde node_modules en runtime.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
