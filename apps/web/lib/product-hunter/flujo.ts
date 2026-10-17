// Las REGLAS del flujo nuevo, separadas de la pantalla que las dibuja.
//
// Están acá y no dentro del componente porque son lo que hay que discutir: el
// preview se mira para decidir si estas reglas son las correctas, y una regla
// enterrada en un `onClick` no se puede leer ni probar.
//
// ⚠️ NADA DE ESTO PERSISTE TODAVÍA. Ver `app/(app)/tools/buscador-productos/preview`.

import type { RawProductEntry } from '@ph/shared'

export interface Cupo {
  /** Productos que el usuario puede RECLAMAR en el período. */
  productos: number
  /** Cambios (comodines) para descartar un producto que no era lo esperado. */
  comodines: number
}

/**
 * Tanteado por el dueño del repo: 5+3 / 15+5 / 20+10.
 *
 * ⚠️ NO ES `PLANS[tier].porRango` NI LO PISA. Ese número (10/20/50) es cuántos
 * productos VE el usuario en la lista de hoy, y es lo que promete la tabla de
 * precios; esto es cuántos puede RECLAMAR. Son dos cosas distintas y hoy se
 * contradicen — decidir cuál gana es parte de lo que este preview existe para
 * responder.
 */
export const CUPO: Record<number, Cupo> = {
  1: { productos: 5, comodines: 3 },
  2: { productos: 15, comodines: 5 },
  3: { productos: 20, comodines: 10 },
}

export const cupoDe = (tier: number): Cupo => CUPO[tier] ?? CUPO[1]

export interface Encuesta {
  /** ¿Tenía los anuncios que esperabas? */
  anuncios: boolean | null
  /** ¿El anunciante vendía un solo producto? */
  unSoloProducto: boolean | null
}

export const ENCUESTA_VACIA: Encuesta = { anuncios: null, unSoloProducto: null }

/** La encuesta está respondida cuando NINGUNA pregunta quedó sin contestar. */
export function encuestaCompleta(e: Encuesta): boolean {
  return e.anuncios !== null && e.unSoloProducto !== null
}

/**
 * ⚠️ EL COMODÍN SE OFRECE SOLO SI LA ENCUESTA DICE QUE ALGO FALLÓ.
 *
 * Ofrecerlo siempre lo convierte en un botón de "siguiente" gratis: el usuario
 * pasa productos hasta que le guste uno y el cupo deja de significar nada. Es el
 * margen de error por la basura que trae el scraper, no una segunda tirada.
 *
 * Un `null` (pregunta sin responder) NO cuenta como fallo: no se puede reclamar
 * un cambio por algo que no se dijo.
 */
export function ofreceComodin(e: Encuesta, comodinesQuedan: number): boolean {
  const falló = e.anuncios === false || e.unSoloProducto === false
  return falló && comodinesQuedan > 0
}

/**
 * Un producto del pool que este usuario no haya visto todavía.
 *
 * ⚠️ ALEATORIO A PROPÓSITO, y es el punto del rediseño: con una lista ordenada
 * igual para todos, los usuarios se canibalizan testeando lo mismo. `rnd` entra
 * por parámetro para poder probarlo.
 */
export function siguienteProducto(
  pool: RawProductEntry[],
  vistos: string[],
  rnd: () => number = Math.random,
): RawProductEntry | null {
  const libres = pool.filter((p) => !vistos.includes(p.id))
  if (!libres.length) return null
  return libres[Math.floor(rnd() * libres.length)]
}
