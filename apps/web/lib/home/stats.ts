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
//
// ⚠️ MEDIDO EL 2026-08-15 CONTRA PRODUCCIÓN — dos de estos números no se
// parecen a la realidad, y NO se tocaron acá porque cuánto se infla la vitrina
// es decisión del dueño del repo, no de un barrido de copy:
//
//   select count(*) from ph_raw_products;   -- 70,336 (70,085 no inactivos)
//   select count(distinct niche) from ph_raw_products;  -- 674 nichos
//   select count(*) from ph_gen_usage;      -- 796
//
//   "8,900+ productos"  → el inventario real es 70,336. Se queda CORTO ~8x.
//   "3,400+ activos"    → las generaciones registradas son 796. Infla ~4.3x,
//                         y el mismo string alimenta HERO_COUNTER, que se pinta
//                         en el badge con el punto "en vivo" del hero.
//
// Si se decide cablearlos, la ruta está descrita arriba y ya no hace falta
// medir: son esas tres queries.

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
