/**
 * Los huecos que quedaron sin rellenar en el guión adaptado.
 * ---------------------------------------------------------------------------
 * Un marcador que llega al render se lee en voz alta dentro de un lote ya pagado, así
 * que esto es lo que bloquea el paso siguiente (`generate-lotes` lo vuelve a comprobar
 * sobre el texto guardado, no confía en el cliente).
 */

const MARCADOR = /\[PENDIENTE:[^\]]*\]/gi

/**
 * Los marcadores que realmente quedaron en el guión.
 *
 * NO se usa el `variablesPendientes` que devuelve el modelo: se le pide que coincida
 * exactamente con el texto y no lo cumple — en una corrida real devolvió los nombres
 * sin corchetes y con `resultado` repetido cuatro veces, mientras el texto traía cuatro
 * marcadores idénticos. Parsear el texto es determinista y no se puede desincronizar de
 * lo que el usuario está leyendo, que es la única fuente que importa acá.
 *
 * Los repetidos se colapsan en uno: el mismo nombre de variable es el mismo dato, y lo
 * que se cuenta es cuántos datos faltan, no cuántas veces aparecen. Mantiene el orden de
 * aparición para que el aviso siga el hilo del guión.
 */
export function extractPending(guion: string): string[] {
  return [...new Set(guion.match(MARCADOR) ?? [])]
}
