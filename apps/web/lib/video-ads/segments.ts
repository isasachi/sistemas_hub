/**
 * Partir una locución en frases para MOSTRARLA y EDITARLA por partes.
 * ---------------------------------------------------------------------------
 * Es puramente de presentación: el dato sigue siendo un solo string por toma
 * (`adapted.tomas[].locucion`), y al guardar se vuelve a unir. Se resolvió por acá y no
 * partiendo `adapted.tomas` porque eso arrastraba tres degradaciones silenciosas en
 * caminos que manejan dinero — `resyncTomaDurations` empareja por índice y empezaría a
 * devolver `null` (la reparación de tiempos dejaría de llegar al render),
 * `tiempoOriginal` se compartiría entre fragmentos, y cambiaría la forma de la huella.
 *
 * El caso que lo pide: un video de referencia SIN CORTES da una sola toma con el guión
 * entero — 33 s continuos fueron 706 caracteres en una única línea editable. El render
 * ya lo parte en clips (`splitLongToma`, regla 7 del spec), pero el usuario no tenía
 * dónde trabajarlo.
 *
 * El corte va por frase, que es el "punto natural de acción o diálogo" del spec y el
 * mismo criterio que usa `splitLongToma` para repartir en lotes — así lo que se edita
 * por separado se parece a lo que después se renderiza por separado.
 */

/** Fin de frase seguido de espacio: el punto natural de corte del spec. */
const FIN_DE_FRASE = /(?<=[.!?])\s+/

/**
 * Las frases de una locución. Nunca devuelve vacío: un texto sin puntuación es UN
 * segmento, no cero — si no, la toma desaparecería de la pantalla.
 */
export function segmentar(texto: string): string[] {
  const partes = texto.split(FIN_DE_FRASE).map((p) => p.trim()).filter(Boolean)
  return partes.length ? partes : [texto]
}

/**
 * Vuelve a unir los segmentos en la locución que se persiste.
 *
 * El ida y vuelta normaliza el espacio ENTRE frases a uno solo (dos espacios seguidos
 * quedan en uno). Es texto hablado: esa diferencia no significa nada y no se ve, así que
 * se prefiere eso a arrastrar los separadores originales por toda la UI para poder
 * reconstruirlos byte a byte.
 */
export function unir(segmentos: string[]): string {
  return segmentos.map((s) => s.trim()).filter(Boolean).join(' ')
}
