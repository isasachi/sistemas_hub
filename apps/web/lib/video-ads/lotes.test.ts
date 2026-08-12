import { describe, it, expect } from 'vitest'
import { groupIntoLotes, LOTE_MAX_SEC, LoteSchema, buildLotePrompt } from './lotes'
import type { TomaFinal } from './adapt'
import { KIE_PROMPT_MAX } from './kie'

const toma = (n: number, duracionSeg: number, locucion = `linea ${n}`): TomaFinal => ({
  n, duracionSeg, locucion,
  tiempoOriginal: '00:00 - 00:00',
  accionVisual: `accion ${n}`, personaje: 'Mujer de 25', producto: 'Frasco celeste',
})

describe('groupIntoLotes', () => {
  it('mete todo en un lote si cabe en 15 s', () => {
    const l = groupIntoLotes([toma(1, 5), toma(2, 4), toma(3, 5)])
    expect(l).toHaveLength(1)
    expect(l[0].tomas.map((t) => t.n)).toEqual([1, 2, 3])
    expect(l[0].duracionSeg).toBe(14)
  })

  // La regla del spec: si agregar la siguiente supera 15.0, NO la agregues; esa toma
  // abre el lote siguiente. Nunca se parte una toma entre dos lotes.
  it('corta antes de pasarse y arranca el siguiente lote con esa toma', () => {
    const l = groupIntoLotes([toma(1, 6), toma(2, 6), toma(3, 6)])
    expect(l).toHaveLength(2)
    expect(l[0].tomas.map((t) => t.n)).toEqual([1, 2])
    expect(l[0].duracionSeg).toBe(12)
    expect(l[1].tomas.map((t) => t.n)).toEqual([3])
    expect(l[1].duracionSeg).toBe(6)
  })

  it('permite el lote que suma exactamente 15', () => {
    const l = groupIntoLotes([toma(1, 7.5), toma(2, 7.5), toma(3, 1)])
    expect(l[0].tomas.map((t) => t.n)).toEqual([1, 2])
    expect(l[0].duracionSeg).toBe(15)
    expect(l[1].tomas.map((t) => t.n)).toEqual([3])
  })

  it('numera los lotes desde 1 y en orden', () => {
    const l = groupIntoLotes([toma(1, 15), toma(2, 15), toma(3, 15)])
    expect(l.map((x) => x.n)).toEqual([1, 2, 3])
  })

  it('nunca produce un lote de más de 15 s', () => {
    const tomas = Array.from({ length: 20 }, (_, i) => toma(i + 1, 4))
    for (const l of groupIntoLotes(tomas)) expect(l.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })

  // Excepción del spec: "Si una única Toma supera 15 segundos, divídela solamente en
  // puntos naturales de acción o diálogo sin alterar el contenido."
  it('parte una toma larga en frases, sin perder texto', () => {
    const larga = toma(1, 24, 'Primera frase completa. Segunda frase completa. Tercera frase completa.')
    const l = groupIntoLotes([larga])
    expect(l.length).toBeGreaterThan(1)
    for (const x of l) expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
    const texto = l.flatMap((x) => x.tomas.map((t) => t.locucion)).join(' ')
    expect(texto).toContain('Primera frase completa')
    expect(texto).toContain('Tercera frase completa')
  })

  it('una toma larga sin puntos igual se acota a 15 s por lote', () => {
    const l = groupIntoLotes([toma(1, 40, 'una sola frase larguísima sin puntuación alguna')])
    for (const x of l) expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })

  it('sin tomas devuelve lista vacía', () => {
    expect(groupIntoLotes([])).toEqual([])
  })

  // CRITICAL (fix round 1) — caso reproducido por el revisor: una frase corta ("Ok.")
  // seguida de una larga hace que el reparto proporcional por caracteres deje casi toda
  // la duración en el fragmento largo, que solo se pasaba del tope. La v1 no lo
  // re-verificaba tras dividir; ahora `splitLongToma` recurre sobre cada fragmento hasta
  // que quepa, así que el invariante (ningún lote > 15 s) se sostiene también acá.
  it('una frase corta seguida de una larga no produce un lote sobre el tope', () => {
    const larga = toma(1, 16, 'Ok. ' + 'palabra '.repeat(150) + '.')
    const l = groupIntoLotes([larga])
    for (const x of l) expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })

  // IMPORTANT (fix round 1) — los fragmentos de una toma dividida ya no comparten `n`:
  // colisionarían al rotular "Toma N" en el prompt de Task 5 (dos "Toma 1" distintas).
  it('los fragmentos de una toma dividida tienen n únicos y sin huecos', () => {
    const larga = toma(1, 40, 'Primera frase. Segunda frase. Tercera frase. Cuarta frase.')
    const l = groupIntoLotes([larga])
    const ns = l.flatMap((x) => x.tomas.map((t) => t.n))
    expect(new Set(ns).size).toBe(ns.length)
    expect(ns).toEqual(Array.from({ length: ns.length }, (_, i) => i + 1))
  })

  // IMPORTANT (fix round 1) — una duración NaN nunca hacía `> LOTE_MAX_SEC` (toda
  // comparación con NaN es falsa), así que el lote nunca cerraba y fusionaba TODO el
  // resto del guión. Caso exacto reproducido por el revisor.
  it('una duración NaN no fusiona el resto del guión en un solo lote', () => {
    const tomas = [toma(1, 5), { ...toma(2, 0), duracionSeg: NaN }, toma(3, 14), toma(4, 14)]
    const l = groupIntoLotes(tomas)
    expect(l.length).toBeGreaterThan(1)
    for (const x of l) {
      expect(Number.isFinite(x.duracionSeg)).toBe(true)
      expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
    }
  })

  // IMPORTANT (fix round 1) — con duración Infinity, `Math.ceil(Infinity / 15)` es
  // Infinity y `Array.from({ length: Infinity })` lanzaba RangeError: una sola toma
  // malformada tiraba abajo toda la función.
  it('una duración Infinity no revienta la función', () => {
    expect(() => groupIntoLotes([{ ...toma(1, 0), duracionSeg: Infinity }])).not.toThrow()
    const l = groupIntoLotes([{ ...toma(1, 0), duracionSeg: Infinity }])
    for (const x of l) expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })

  // MINOR (fix round 1) — duración cero o negativa se saneaba a 0 implícitamente (no
  // se dividía), lo que podía desplazar la acumulación sin que nadie lo notara.
  it('duración cero o negativa no rompe el agrupado', () => {
    const l = groupIntoLotes([toma(1, 5), { ...toma(2, 0), duracionSeg: 0 }, { ...toma(3, 0), duracionSeg: -3 }])
    for (const x of l) {
      expect(x.duracionSeg).toBeGreaterThan(0)
      expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
    }
  })

  // MINOR (fix round 1) — `status` ahora es un enum, no un string libre.
  it('LoteSchema rechaza un status fuera del enum', () => {
    const [lote] = groupIntoLotes([toma(1, 5)])
    expect(() => LoteSchema.parse({ ...lote, status: 'bogus' })).toThrow()
    expect(() => LoteSchema.parse(lote)).not.toThrow()
  })

  // CRITICAL (fix round 2) — regresión introducida por el fix round 1: redondear a 1
  // decimal en el leaf de `splitLongToma` (`r1(dur)`) aplastaba la duración ANTES de
  // sumarla, así que `excedeTope` sumaba cifras que ya habían perdido las centésimas.
  // Dos tomas de 7.51 s (15.02 s reales) llegaban a la suma como 7.5 + 7.5 = 15.0 exacto
  // y el guard nunca disparaba: 1 lote en vez de 2. El disparador no es exótico — el
  // análisis forense deriva duraciones de marcas de tiempo de video, así que dos
  // decimales son lo normal, no el caso raro.
  it('dos tomas de 7.51 s (15.02 reales) SÍ se parten en dos lotes', () => {
    const l = groupIntoLotes([toma(1, 7.51), toma(2, 7.51)])
    expect(l).toHaveLength(2)
    for (const x of l) expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })

  it('cinco tomas de 3.04 s (15.20 reales) no caben en un solo lote', () => {
    const l = groupIntoLotes(Array.from({ length: 5 }, (_, i) => toma(i + 1, 3.04)))
    expect(l.length).toBeGreaterThan(1)
    for (const x of l) expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })

  it('quince tomas de 1.04 s (15.60 reales) no caben en un solo lote', () => {
    const l = groupIntoLotes(Array.from({ length: 15 }, (_, i) => toma(i + 1, 1.04)))
    expect(l.length).toBeGreaterThan(1)
    for (const x of l) expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })

  // Property test: entrada generada con muchas tomas de duración variada (incluida una
  // larga que fuerza split, y algunas de dos decimales — el análisis forense deriva
  // duraciones de marcas de tiempo de video, así que 2 decimales son el caso normal, no
  // el exótico; un array de un solo decimal no puede observar el bug del fix round 2)
  // — el invariante debe sostenerse sobre TODOS los lotes: ninguno vacío, ninguno sobre
  // el tope, numeración sin huecos, texto completo y sin duplicar.
  it('invariante sobre una entrada generada: sin vacíos, sin exceso, numeración sin huecos, texto íntegro', () => {
    const duraciones = [3, 7.51, 1, 9.51, 2, 30, 4.43, 12, 0.5, 6, 15, 8, 22, 1.13, 9]
    // Sufijo no-numérico ("end") tras el índice: evita que "token1end" sea substring
    // de "token14end" al contar ocurrencias más abajo.
    const tomas = duraciones.map((d, i) => toma(i + 1, d, `token${i}end`))
    const l = groupIntoLotes(tomas)

    expect(l.length).toBeGreaterThan(0)
    for (const lote of l) {
      expect(lote.tomas.length).toBeGreaterThan(0)
      expect(lote.duracionSeg).toBeGreaterThan(0)
      expect(lote.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
      for (const t of lote.tomas) expect(t.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
    }

    const todasLasN = l.flatMap((x) => x.tomas.map((t) => t.n))
    expect(todasLasN).toEqual(Array.from({ length: todasLasN.length }, (_, i) => i + 1))

    // Cada token único del guión original aparece exactamente una vez en la salida.
    const textoSalida = l.flatMap((x) => x.tomas.map((t) => t.locucion)).join(' ')
    for (let i = 0; i < duraciones.length; i++) {
      const ocurrencias = textoSalida.split(`token${i}end`).length - 1
      expect(ocurrencias).toBe(1)
    }
  })
})

const BLOQUE = 'Mujer de 25 años, latina peruana, cabello negro liso recogido en moño bajo, piel clara, ojos marrón claro, complexión delgada, polo blanco de algodón sin estampado.'
const VOZ = {
  idioma: 'Español', varianteRegional: 'Perú - Lima', acento: 'Limeño', pronunciacion: 'Clara',
  ritmo: 'Conversacional', velocidad: 'Media', entonacion: 'Natural', energia: 'Media',
  pausas: 'Naturales', tono: 'Cálido', timbre: 'Claro', edadVocal: '25', estilo: 'Amiga',
}
const ARGS = {
  consistencyBlock: BLOQUE,
  productDesc: 'Frasco de vidrio celeste de 30 ml con gotero blanco y etiqueta "EUNOIA".',
  escenario: 'Dormitorio con pared clara y repisas blancas',
  camara: 'Primer plano, altura de ojos, cámara en mano',
  voz: VOZ,
  images: [
    { url: 'https://x/character.png', role: 'la persona' },
    { url: 'https://x/product.png', role: 'el producto' },
  ],
}

describe('buildLotePrompt', () => {
  const lote = groupIntoLotes([toma(1, 5, 'Hola, te cuento algo.'), toma(2, 5, 'Este suero me cambió la piel.')])[0]
  const p = buildLotePrompt({ lote, ...ARGS })

  it('repite el bloque de consistencia íntegro (contexto absoluto)', () => {
    expect(p).toContain(BLOQUE)
  })

  it('repite la descripción del producto íntegra', () => {
    expect(p).toContain(ARGS.productDesc)
  })

  it('nunca usa referencias a lotes anteriores', () => {
    for (const prohibido of ['el mismo personaje', 'el producto anterior', 'la misma habitación', 'igual que en el Lote', 'mantener lo anterior']) {
      expect(p.toLowerCase()).not.toContain(prohibido.toLowerCase())
    }
  })

  it('lleva la locución exacta de sus tomas y nada más', () => {
    expect(p).toContain('Hola, te cuento algo.')
    expect(p).toContain('Este suero me cambió la piel.')
  })

  it('prohíbe todo overlay', () => {
    expect(p).toMatch(/TEXTO \/ OVERLAY: NINGUNO/)
    expect(p).toMatch(/watermark/i)
    expect(p).toMatch(/subt[ií]tulos|captions/i)
  })

  it('numera las imágenes en el orden del array', () => {
    expect(p).toContain('@image(1) = la persona')
    expect(p).toContain('@image(2) = el producto')
  })

  it('incluye el perfil de voz completo', () => {
    expect(p).toContain('Limeño')
    expect(p).toContain('Perú - Lima')
  })

  it('entra en el tope de prompt de KIE', () => {
    expect(p.length).toBeLessThanOrEqual(KIE_PROMPT_MAX)
  })

  it('un lote de muchas tomas también entra en el tope', () => {
    const largo = groupIntoLotes(Array.from({ length: 8 }, (_, i) =>
      toma(i + 1, 1.8, `Frase número ${i + 1} del guión adaptado que dice bastante.`)))[0]
    expect(buildLotePrompt({ lote: largo, ...ARGS }).length).toBeLessThanOrEqual(KIE_PROMPT_MAX)
  })

  // Fix round 1 — el test anterior usa `accionVisual` sintético de ~9 caracteres
  // (`accion ${n}`), muy por debajo del detalle forense real (AGENTS.md: ~6300 chars
  // con ~11 beats). Este caso fuerza la degradación de verdad: bloque de consistencia
  // y descripción de producto verbosos, y 8 tomas con `accionVisual` largo (secuencial:
  // posición inicial, movimiento, manos, mirada, expresión, posición final).
  it('con contenido de tamaño realista, degrada la sección de acciones pero conserva la cámara y entra en el tope', () => {
    const bloqueLargo = 'Mujer de 25 años, latina peruana, cabello negro liso recogido en moño bajo, piel clara, ojos marrón claro, complexión delgada, cejas pobladas naturales, nariz recta, labios medianos, polo blanco de algodón sin estampado ni logo, pantalón deportivo gris, sin joyas visibles, manicura natural, uñas cortas. '.repeat(2)
    const productoLargo = 'Frasco de vidrio celeste translúcido de 30 ml con gotero de plástico blanco, tapa rosca plateada, etiqueta blanca centrada con el texto "EUNOIA" en tipografía serif dorada, borde dorado fino alrededor de la etiqueta, sin otros textos ni logos adicionales. '.repeat(2)
    const accionLarga = 'La modelo empieza de pie frente al espejo del baño con las manos a los costados, gira lentamente el torso hacia la cámara, levanta la mano derecha y toma el frasco del producto desde la repisa con dos dedos, lo sostiene a la altura del pecho, lo inclina levemente para mostrar la etiqueta, mira directo a cámara con expresión cálida y sonríe, termina con el frasco cerca del rostro y la mirada fija en el lente. '

    const argsLargos = { ...ARGS, consistencyBlock: bloqueLargo, productDesc: productoLargo }
    const muchasTomas = groupIntoLotes(Array.from({ length: 8 }, (_, i) =>
      ({ ...toma(i + 1, 1.8, `Frase número ${i + 1} del guión adaptado, bastante larga también, para sumar presión de caracteres sobre el presupuesto del prompt.`), accionVisual: accionLarga })))[0]

    const p = buildLotePrompt({ lote: muchasTomas, ...argsLargos })
    expect(p.length).toBeLessThanOrEqual(KIE_PROMPT_MAX)
    // La cámara nunca se recorta (regla de AGENTS.md: es corta y sostiene el encuadre).
    expect(p).toContain(argsLargos.camara)
    // El bloque de consistencia y la descripción de producto tampoco se recortan bajo
    // presión de presupuesto — solo la sección de acciones se degrada.
    expect(p).toContain(bloqueLargo)
    expect(p).toContain(productoLargo)
    // Prueba que SÍ llegó a degradar, no que por casualidad entró en el nivel completo:
    // sin locución por toma (nivel 2) y con `accionVisual` truncada (piso, con "…").
    expect(p).not.toMatch(/Locución: /)
    expect(p).toContain('…')
    // La locución sigue siendo exacta pese a la degradación: sobrevive en el bloque
    // GUION DE LOCUCIÓN FINAL aunque las líneas por-toma se hayan soltado.
    expect(p).toContain('Frase número 8')
  })

  it('si ni el bloque de consistencia por sí solo entra en el tope, lanza un error explicando el exceso', () => {
    const bloqueImposible = 'x'.repeat(KIE_PROMPT_MAX * 2)
    expect(() => buildLotePrompt({ lote, ...ARGS, consistencyBlock: bloqueImposible })).toThrow()
    expect(() => buildLotePrompt({ lote, ...ARGS, consistencyBlock: bloqueImposible }))
      .toThrow(new RegExp(String(KIE_PROMPT_MAX)))
  })
})
