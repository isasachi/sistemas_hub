import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ph/shared se publica como TypeScript crudo (sin build step). Next debe
  // transpilarlo igual que el código de la app, sino el build de Vercel falla
  // al ver .ts del workspace. Ver AGENTS.md (monorepo).
  transpilePackages: ["@ph/shared"],
};

export default nextConfig;
