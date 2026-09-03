/**
 * ⚠️ EL SCAN DESCRIBE LA FOTO, NO SOLO EL PRODUCTO — Y ESO VIAJA AL RENDER.
 *
 * `productDescription` sale de mirar la foto del envase, y el modelo describe de paso la
 * PUESTA EN ESCENA de esa foto: sobre qué superficie está apoyado, qué sombra proyecta,
 * de dónde viene la luz. Medido sobre los 35 scans guardados, **10 (29 %) traen al menos
 * una frase así**, con *"No está flotando."* como la más común (6 de 16 frases).
 *
 * No es cosmético: `productDescription` se emite ÍNTEGRA en el prompt de CADA lote, así
 * que *"El producto descansa sobre una superficie blanca plana y produce una sombra suave
 * a la derecha"* es una instrucción de escena dentro de un clip donde la persona lo tiene
 * en la mano en una sala. Es exactamente la clase de contaminación que se acaba de sacar
 * con `SETTING AND LIGHTING`: texto que describe un escenario que no es el del clip. Y en
 * FASE 3 el modelo la copió tal cual dentro de `accionVisual`, que es el campo de
 * COREOGRAFÍA — el síntoma con el que se reportó.
 *
 * ⚠️ SE LIMPIA EN CÓDIGO ADEMÁS DE EN EL PROMPT, por el mismo motivo que `limpiarDialogos`:
 * el prompt no es garantía, y la limpieza en código es lo único que repara las sesiones YA
 * guardadas (el scan es una llamada de visión pagada; re-correrlo por esto no se justifica).
 *
 * ⚠️ EL ACOTE ES ANGOSTO A PROPÓSITO, y la primera versión ya se pasó: con `sobre un
 * fondo` en el patrón se comía *"Las letras son en su mayoría en blanco y rosa sobre un
 * fondo negro"*, que SÍ describe el producto. El modo de fallo correcto es dejar pasar una
 * frase de escenografía, nunca borrar la identidad del envase — por eso `sombra` exige un
 * adjetivo de sombra proyectada (si no, se comería una "sombra de ojos", que es un
 * producto entero) y por eso, si al limpiar no queda nada, se devuelve el original.
 */
const ESCENA_DE_FOTO =
  /(flotand|\bflota\b|descansa sobre|apoyad[oa]s?\s+(?:en|sobre)|sombra\s+(?:suave|difusa|sutil|proyectada|ligera|tenue)|ángulo de c[aá]mara|iluminaci[oó]n difusa)/i

/** Quita las frases que describen la FOTO del producto en vez del producto. */
export function limpiarEscenaDeFoto(desc: string): string {
  const frases = desc.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
  if (!frases) return desc
  const limpio = frases.filter((f) => !ESCENA_DE_FOTO.test(f)).join('').trim()
  // Fail-safe: si el patrón se llevó todo, el patrón está mal y el original es mejor.
  return limpio || desc
}

/** El scan con la descripción del producto ya limpia. Null pasa tal cual. */
export function limpiarProductScan<T extends { productDescription?: string | null } | null>(scan: T): T {
  if (!scan?.productDescription) return scan
  const limpio = limpiarEscenaDeFoto(scan.productDescription)
  return limpio === scan.productDescription ? scan : { ...scan, productDescription: limpio }
}
