/**
 * Rate-limit de las rutas que llaman Gemini (la generación es la llamada cara).
 * Sin esto, los endpoints de generación (app/api/.../route.ts) que generan
 * imágenes/texto eran world-callable sin tope → un curl en loop = gasto LLM ilimitado.
 *
 * Dos capas (1 fila en ph_gen_usage por generación, keyed por session_id + kind):
 *   CRÉDITOS del plan (30/100/180 al mes según el tier) — solo las imágenes de
 *     anuncios, branding y landing; ver credits.ts. El video NO los gasta.
 *   PER-STEP (imagen + los pocos kinds de texto/video tan caros como una imagen,
 *     ver IMAGE_KINDS) — 1 gen libre + 3 regens por (sesión, step). UX visible
 *     vía regensLeft; el step es `kind`, la instancia de tool es `session_id`.
 *   GLOBAL diario (día America/Lima, reusa limaSearchDay) — backstop de costo
 *     anti-abuso: cuenta imagen + texto; un atacante con sesiones infinitas choca aquí.
 *   Texto: regens ilimitadas (no toca el pool de 3) pero sí cuenta al backstop global.
 *
 * checkGenQuota lee y decide ANTES de generar; recordGenQuota inserta DESPUÉS de un
 * éxito (un fallo no quema una regen). Tabla: ph_gen_usage —
 * migraciones 20260622000001_ph_gen_usage.sql + 20260626000002_ph_gen_usage_session.sql.
 *
 * `checkGlobalBackstop` expone SOLO la capa global (sin el gate per-step) para un
 * caso puntual: el render de video por lotes (generate-lotes/route.ts) necesita
 * seguir respetando el backstop anti-abuso cuando REANUDA un render pagado (sigue
 * llamando a KIE, sigue costando), pero reanudar no debe chocar contra el gate
 * per-step de `video-generation` — esa cuota ya se cobró la primera vez.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { limaSearchDay } from './product-hunter/quota'
import { checkCredits, type CreditStatus, type CreditOwner } from './credits'

let _db: SupabaseClient | null = null
function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
  }
  return _db
}

export const GEN_GLOBAL_DAILY_LIMIT = Number(process.env.GEN_GLOBAL_DAILY_LIMIT ?? 500)
export const GEN_PER_STEP_LIMIT = Number(process.env.GEN_PER_STEP_LIMIT ?? 4) // 1 libre + 3 regens

// Steps de imagen (los caros) + kinds NO-imagen que igual necesitan el mismo cap
// per-step por costo. Match por prefijo: landing-section incluye `:${type}`.
//
// `video-forensic` (análisis forense del video de referencia del generador de
// video ads) es texto, no imagen — pero manda hasta 14 MB de video a Gemini, así
// que es la llamada más cara de esa tool hoy. El tope vivía en `video-render`
// (1 gen + 2 regens) porque ese era el paso caro; el render se eliminó de esta
// rama en su momento (lo reconstruyó un plan posterior) y con él se fue su cap,
// dejando el paso caro que SÍ seguía corriendo (`video-forensic`) sin ningún tope
// per-step — solo el backstop global de 500/día, y "Extraer otra vez" en
// Section4Template no vuelve a llamar Gemini sobre el video (usa el análisis ya
// guardado), así que no necesita su propio cap. Se agregó acá con el límite
// genérico (GEN_PER_STEP_LIMIT) en vez de crear un tercer branch en `limitFor`:
// es "razonable" sin tocar el comportamiento de ningún otro kind del hub.
//
// `video-render` YA NO está acá (fix round 2, Task 6): el render por lotes reveló
// que topar por LOTE no tiene sentido — un guión de 2 lotes se quedaba sin
// regeneraciones y uno de 4 nunca lograba renderizar, cuando 30 s (lo que suben los
// usuarios) da 3-4 lotes según cómo caigan los cortes. El tope real es POR VIDEO
// (`video-generation`, ver VIDEO_GENERATION_LIMIT más abajo): 1 fila por llamada a
// `generate-lotes` que efectivamente arranca tareas, sin importar cuántos lotes
// tenga ese guión. `video-render` se sigue registrando —una fila por lote, para
// conservar la visibilidad del costo real y seguir contando al backstop global—
// pero deja de tener tope per-step: por eso sale de este array.
export const IMAGE_KINDS = ['branding-identidad', 'branding-logo', 'branding-etiqueta', 'branding-mockup', 'anuncios-image', 'landing-section', 'video-character', 'video-generation', 'video-forensic']
export function isImageKind(kind: string): boolean {
  return IMAGE_KINDS.some((k) => kind === k || kind.startsWith(k + ':'))
}

// El render de video (Grok vía KIE) cuesta un orden de magnitud más que una imagen,
// así que tiene su propio tope — pero por VIDEO, no por lote: 1 generación + 2
// regens para TODO el video, sin importar en cuántas llamadas a KIE se reparta su
// guión (`groupIntoLotes` puede partirlo en 1, 2, 3... lotes de hasta 15 s cada uno).
//
// ⚠️ NOTA DE DISEÑO (fix round 4 — corrige lo que decía el round 3, que ya era falso
// cuando se escribió): mientras el CONTENIDO no cambie, las "+2 regens" de este tope
// son inalcanzables dentro de una sesión. En cuanto la primera llamada crea aunque sea
// una tarea, `session.lotes` deja de tener todo en `idle`: todo POST sin `resume`
// recibe 409 (`existentes.some(taskId) && !resume`), y todo POST con `resume: true`
// sobre el mismo contenido entra por `isPaidResume` → `reanuda: true` → nunca vuelve a
// llamar `recordGenQuota(id, 'video-generation', …)`. Para ese usuario el tope de 3 se
// comporta como un tope de 1.
//
// Lo que SÍ registra una segunda (y tercera) fila de `video-generation` para la misma
// sesión: re-hacer el guión (`video-adapt`), el personaje o la voz y volver a llamar.
// Ahí la huella de contenido guardada en los lotes deja de coincidir, `isPaidResume`
// da `false` y la llamada se cobra como el video nuevo que es — que es precisamente
// para lo que este tope existe, y por eso hay que dejarlo en 3 y no bajarlo a 1.
// Cuando la Task 7 conecte un botón de "generar de nuevo desde cero" (regenerar el
// MISMO contenido, que es el caso que hoy no tiene camino), ese botón va a necesitar
// limpiar `video_sessions.lotes` de vuelta a `null` (NO a `[]`) SIN tocar las filas
// ya insertadas en `ph_gen_usage` — son las que hacen que la 2ª y 3ª regeneración sí
// choquen contra el tope cuando corresponda. Si en cambio se resetean o se borran
// esas filas, esta cuota deja de significar nada. Tiene que ser `null` y no `[]`
// por DOS motivos, no uno: (a) es la única condición que `claimFreshLotes` acepta
// (`lotes IS NULL`) para volver a reclamar la fila atómicamente; (b) con `lotes:
// null`, `existentes` vuelve a ser `[]` en la siguiente llamada — nada que abandonar,
// ninguna ambigüedad de si un `resume` es real. Limpiar a `[]` en vez de `null`
// dejaría la fila para siempre fuera del alcance de `claimFreshLotes` (esa condición
// nunca volvería a cumplirse) sin ganar nada a cambio. Invariante nuevo que ese botón
// también tiene que respetar (fix round 5/6): `render_done` (`video_sessions`,
// `render-lotes.ts` `renderDone`) se escribe SIEMPRE en el mismo write que toca
// `lotes` — el reset a `null` tiene que llevarse `render_done` de vuelta a `false` en
// la misma escritura, o el dashboard se queda mostrando "listo" sobre una sesión que
// ese botón acaba de vaciar para regenerar.
export const VIDEO_GENERATION_LIMIT = Number(process.env.GEN_VIDEO_LIMIT ?? 3)
function limitFor(kind: string): number {
  return kind === 'video-generation' ? VIDEO_GENERATION_LIMIT : GEN_PER_STEP_LIMIT
}

// regens restantes DESPUÉS de la gen nº `count+1` para un step con `count` filas previas.
export function regensLeftFor(count: number, kind = ''): number {
  return Math.max(0, limitFor(kind) - Math.max(1, count))
}

/**
 * Backstop global diario puro (cuenta imagen + texto, cualquier kind). Extraído para
 * que `checkGlobalBackstop` (solo esta capa) y `checkGenQuota` (esta capa + el gate
 * per-step) compartan la misma lectura en vez de tener el número 500/día en dos
 * lugares que se puedan desincronizar.
 *
 * `failed` es DISTINTO de "no bloqueado" — importa que el caller no los confunda:
 * `checkGenQuota` fail-abre ante un error de DB (con la DB caída no bloqueamos), pero
 * fail-abrir significa devolver `blocked: null` DIRECTO, saltándose el paso 2/3 (el
 * gate per-step). Colapsar "la query de backstop falló" y "la query dio bajo el
 * límite" en el mismo `null` haría que `checkGenQuota` siguiera de largo hacia el
 * gate per-step en vez de fail-abrir — cambiaría su comportamiento para TODOS los
 * kinds de imagen del hub (branding/anuncios/landing), no solo para el video nuevo.
 */
async function globalBackstop(): Promise<{ blocked: Response | null; failed: boolean }> {
  const db = getDb()
  const day = limaSearchDay()
  const { count: globalCount, error: gErr } = await db
    .from('ph_gen_usage').select('*', { count: 'exact', head: true }).eq('gen_day', day)
  if (gErr) { console.error('[gen-quota] global:', gErr.message); return { blocked: null, failed: true } }
  if ((globalCount ?? 0) >= GEN_GLOBAL_DAILY_LIMIT) {
    return { blocked: Response.json({ error: 'El servicio alcanzó su límite diario de generaciones. Vuelve mañana.' }, { status: 429 }), failed: false }
  }
  return { blocked: null, failed: false }
}

/**
 * Solo el backstop global, SIN el gate per-step — para una llamada que sí va a
 * gastar (crea tarea real en un proveedor) pero no debe chocar contra un tope
 * per-step pensado para otra cosa. Hoy el único caller es "reanudar" un render de
 * video: ya pagó su `video-generation`, pero seguir creando tareas para los lotes
 * que quedaron pendientes sigue costando y tiene que respetar el backstop anti-abuso
 * igual que cualquier otra llamada cara del hub.
 *
 * Fail-open ante error de DB, igual que el resto del módulo (`failed` se descarta a
 * propósito: acá no hay un paso 2/3 del que fail-abrir tenga que saltarse).
 */
export async function checkGlobalBackstop(): Promise<{ blocked: Response | null }> {
  return { blocked: (await globalBackstop()).blocked }
}

/**
 * Lee los contadores y decide ANTES de generar. NO inserta nada.
 * - blocked: un Response 429 listo (texto en español) o null si puede proceder.
 * - regensLeft: regens que quedarán tras esta gen (imagen) o null (texto = ilimitado).
 *
 * ponytail: count-then-insert no atómico → bajo ráfaga el tope puede pasarse por
 * ~concurrencia filas. Aceptable para un backstop de costo. ponytail: fail-open ante
 * error DB (igual que el resto del hub): con DB caída no bloqueamos.
 */
export async function checkGenQuota(
  sessionId: string | null,
  kind: string,
  // Dueño de los créditos ya resuelto. Solo lo pasa el stream de branding, que llama
  // a esta función con los headers de la respuesta ya enviados y por eso no puede
  // leer las cookies de la request. Ver `CreditOwner` en credits.ts.
  owner?: CreditOwner | null,
): Promise<{ blocked: Response | null; regensLeft: number | null; credits?: CreditStatus | null }> {
  // 1. Backstop global diario (cuenta imagen + texto). `failed` fail-abre ACÁ
  // (return inmediato, nunca llega al paso 2/3) — si se colapsara con "no bloqueado"
  // sin distinguir, un error de DB en este conteo dejaría seguir de largo hacia el
  // gate per-step en vez de fail-abrir de una, cambiando el comportamiento de fondo
  // para TODOS los kinds de imagen (branding/anuncios/landing), no solo video.
  const global = await globalBackstop()
  if (global.failed || global.blocked) return { blocked: global.blocked, regensLeft: null }

  // 2. Créditos del plan (solo imágenes de anuncios/branding/landing — el video no
  // los gasta, ver credits.ts). Va ANTES del gate per-step: el per-step es UX
  // ("te quedan 3 regeneraciones de este paso") y los créditos son lo que el
  // usuario compró, así que el mensaje correcto cuando se acabaron es ese.
  const creditos = await checkCredits(kind, owner)
  if (creditos.blocked) return { blocked: creditos.blocked, regensLeft: 0, credits: creditos.credits }

  // 3. Texto: sin tope per-step.
  if (!isImageKind(kind) || !sessionId) {
    return { blocked: null, regensLeft: null, credits: creditos.credits }
  }

  const db = getDb()

  // 4. Per-step (imagen): count(session_id, kind).
  const { count: stepCount, error: sErr } = await db
    .from('ph_gen_usage').select('*', { count: 'exact', head: true }).eq('session_id', sessionId).eq('kind', kind)
  if (sErr) { console.error('[gen-quota] step:', sErr.message); return { blocked: null, regensLeft: null, credits: creditos.credits } }
  const used = stepCount ?? 0
  const limit = limitFor(kind)
  if (used >= limit) {
    return { blocked: Response.json({ error: `Llegaste al límite de ${limit - 1} regeneraciones para este paso.` }, { status: 429 }), regensLeft: 0, credits: creditos.credits }
  }
  return { blocked: null, regensLeft: regensLeftFor(used + 1, kind), credits: creditos.credits }
}

/** Registra una generación exitosa (1 fila). Llamar SOLO tras generar OK.
 * NUNCA lanza: envuelve en try/catch para proteger al caller (la generación ya fue exitosa).
 */
export async function recordGenQuota(sessionId: string | null, kind: string, userId: string | null): Promise<void> {
  try {
    const { error } = await getDb().from('ph_gen_usage').insert({ user_id: userId, kind, gen_day: limaSearchDay(), session_id: sessionId })
    if (error) console.error('[gen-quota] registrando:', error.message)
  } catch (err) {
    console.error('[gen-quota] registrando:', err instanceof Error ? err.message : String(err))
  }
}

/**
 * Cuenta las generaciones ya registradas de un (sesión, kind). Utilidad genérica de
 * solo lectura (por ejemplo, para mostrarle al usuario "usaste X de Y") — el render
 * por lotes usó esto en su primera versión para una cuota "por lote" que se abandonó
 * (fix round 2: la cuota real es por VIDEO, un simple `checkGenQuota` por llamada
 * alcanza) pero se deja la utilidad porque sigue siendo válida en general.
 *
 * Fail-open ante error de DB, igual que el resto del módulo: con la DB caída no
 * bloqueamos (el backstop global sigue siendo la red de seguridad).
 */
export async function countGenUsage(sessionId: string | null, kind: string): Promise<number> {
  if (!sessionId) return 0
  try {
    const { count, error } = await getDb()
      .from('ph_gen_usage').select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId).eq('kind', kind)
    if (error) { console.error('[gen-quota] count:', error.message); return 0 }
    return count ?? 0
  } catch (err) {
    console.error('[gen-quota] count:', err instanceof Error ? err.message : String(err))
    return 0
  }
}
