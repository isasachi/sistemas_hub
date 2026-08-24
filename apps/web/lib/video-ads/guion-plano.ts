/**
 * El guión adaptado como UN solo texto editable, y de vuelta.
 * ---------------------------------------------------------------------------
 * El paso del guión muestra el resultado autocompletado para leerlo, y un botón lo
 * convierte en un único textarea para corregir lo que haga falta. Ese textarea tiene
 * que poder volver a `adapted.tomas[]`, que es lo que `groupIntoLotes` reparte en
 * clips.
 *
 * ⚠️ NO se parte `adapted.tomas` para esto, y no es una preferencia: `resyncTomaDurations`
 * empareja por índice, `tiempoOriginal` es la clave con la que `camaraDeLote` cruza lote
 * y plano, y las dos cosas entran en `scriptFingerprint`. Por eso el texto plano lleva
 * una cabecera por toma y la vuelta exige que el número de tramos coincida: antes que
 * adivinar la alineación, se rechaza el guardado y se dice por qué. Alinear mal es
 * silencioso; un error se ve.
 */

/** `--- Toma 3 ---`, en su propia línea. Tolera espacios y un número de guiones cualquiera. */
const CABECERA = /^[ \t]*-{2,}[ \t]*Toma[ \t]+\d+[ \t]*-{2,}[ \t]*$/gim

export function aTextoPlano(tomas: { n: number; locucion: string }[]): string {
  return tomas.map((t) => `--- Toma ${t.n} ---\n${t.locucion}`).join('\n\n')
}

/**
 * Los tramos del texto plano, uno por toma, o `null` si no cuadran con `esperadas`.
 *
 * `null` es el resultado correcto cuando el usuario borra o duplica una cabecera: lo
 * que se persiste es una locución POR TOMA y cada una tiene su propia duración de clip,
 * así que repartir mal el texto desincroniza el audio de la imagen sin que nada lo
 * reporte.
 */
export function deTextoPlano(texto: string, esperadas: number): string[] | null {
  // `split` sobre una regex global: los tramos quedan entre cabeceras. El primero es lo
  // que haya ANTES de la primera (normalmente vacío) y se descarta.
  const tramos = texto.split(CABECERA)
  if (tramos.length !== esperadas + 1) return null
  if (tramos[0].trim()) return null
  // Una toma muda es un tramo vacío legítimo, así que solo se recorta el espacio: no se
  // filtra por contenido ni se rellena nada.
  return tramos.slice(1).map((t) => t.trim())
}
