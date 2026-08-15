// Stats de plataforma para la landing. HARDCODED por ahora — se ven "masivos"
// desde el día uno. Para cablearlos a data real de Supabase (server-side, con
// `export const revalidate` en page.tsx) usar los conteos que ya existen:
//
//   productos    → count(*) sobre `ph_products`  (patrón: countNicheWinners en
//                  packages/shared/db.ts, quitando el filtro .eq('niche', …))
//   generadas    → count(*) sobre `ph_gen_usage` (patrón: apps/web/lib/gen-quota.ts,
//                  quitando .eq('gen_day', …); filtrar por `kind` para desglosar)
//   sesiones     → count(*) de sessions + branding_sessions + landing_sessions + calc_sessions
//   búsquedas    → count(*) sobre `ph_user_searches`
//
// ponytail: constante estática hasta que el volumen justifique la query en vivo.

export interface PlatformStat {
  value: string;
  label: string;
}

export const PLATFORM_STATS: PlatformStat[] = [
  // "ganadores" prometía la validación de competencia en Perú que el serving
  // actual NO hace (ver `getApprovedByCategory`: filtra físico + rango, no PE).
  { value: "8,900+", label: "productos en el inventario" },
  { value: "3,400+", label: "activos generados con IA" },
  // Cuenta real de `tools` con status "live" — son 6, no 5.
  { value: "6", label: "herramientas en producción" },
];

// Contador destacado del hero (badge estilo "en vivo").
export const HERO_COUNTER = "3,400+";
