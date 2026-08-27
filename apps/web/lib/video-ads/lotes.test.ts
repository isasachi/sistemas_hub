import { describe, it, expect } from 'vitest'
import { groupIntoLotes, LOTE_MAX_SEC, LOTE_MAX_CHARS, LOTE_MAX_COREO, LoteSchema, buildLotePrompt, camaraDeLote, repartirAccion } from './lotes'
import { clampDuration } from './kie'
import type { TomaFinal } from './adapt'
import { KIE_PROMPT_MAX } from './kie'

const toma = (n: number, duracionSeg: number, locucion = `linea ${n}`): TomaFinal => ({
  n, duracionSeg, locucion,
  tiempoOriginal: '00:00 - 00:00',
  accionVisual: `accion ${n}`, personaje: 'Mujer de 25', producto: 'Frasco celeste',
})

describe('groupIntoLotes', () => {
  it('mete todo en un lote si cabe en el tope', () => {
    const l = groupIntoLotes([toma(1, 3), toma(2, 2), toma(3, 3)])
    expect(l).toHaveLength(1)
    expect(l[0].tomas.map((t) => t.n)).toEqual([1, 2, 3])
    expect(l[0].duracionSeg).toBe(8)
  })

  // La regla: si agregar la siguiente supera el tope, NO la agregues; esa toma abre el
  // lote siguiente. Nunca se parte una toma entre dos lotes.
  it('corta antes de pasarse y arranca el siguiente lote con esa toma', () => {
    const l = groupIntoLotes([toma(1, 6), toma(2, 6), toma(3, 6)])
    expect(l).toHaveLength(2)
    expect(l[0].tomas.map((t) => t.n)).toEqual([1, 2])
    expect(l[0].duracionSeg).toBe(12)
    expect(l[1].tomas.map((t) => t.n)).toEqual([3])
    expect(l[1].duracionSeg).toBe(6)
  })

  it('permite el lote que suma exactamente el tope', () => {
    const l = groupIntoLotes([toma(1, 7.5), toma(2, 7.5), toma(3, 1)])
    expect(l[0].tomas.map((t) => t.n)).toEqual([1, 2])
    expect(l[0].duracionSeg).toBe(LOTE_MAX_SEC)
    expect(l[1].tomas.map((t) => t.n)).toEqual([3])
  })

  it('numera los lotes desde 1 y en orden', () => {
    const l = groupIntoLotes([toma(1, 15), toma(2, 15), toma(3, 15)])
    expect(l.map((x) => x.n)).toEqual([1, 2, 3])
  })

  // ⚠️ EL PISO DE HABLA DE `clampDuration` PERFORA EL CAP DE SEGUNDOS, y con 30 s no se
  // veía. Un lote de 400 caracteres devuelve 20 s aunque el cap diga 15: el texto tiene
  // que poder decirse y ese piso manda. Por eso el lote cierra también por caracteres.
  it('cierra el lote por CARACTERES, no solo por segundos', () => {
    const linea = 'x'.repeat(160)
    const l = groupIntoLotes([toma(1, 3, linea), toma(2, 3, linea), toma(3, 3, linea)])
    expect(l.length).toBeGreaterThan(1)
    for (const x of l) {
      const chars = x.tomas.reduce((n, t) => n + t.locucion.length, 0)
      expect(chars).toBeLessThanOrEqual(LOTE_MAX_CHARS)
      // Lo que el presupuesto compra: la duración que se le pide a la API no pasa el cap.
      expect(clampDuration(x.duracionSeg, chars, x.tomas.length)).toBeLessThanOrEqual(LOTE_MAX_SEC)
    }
  })

  // La excepción honesta: una toma que SOLA se pasa del presupuesto no se arregla
  // cerrando el lote, y ahí gana el piso — un clip largo de más antes que una frase
  // cortada a la mitad. Misma jerarquía que dentro de `clampDuration`.
  it('una sola toma que se pasa del presupuesto sigue en su lote', () => {
    const l = groupIntoLotes([toma(1, 10, 'x'.repeat(LOTE_MAX_CHARS + 200))])
    expect(l).toHaveLength(1)
  })

  it('nunca produce un lote de más largo que el tope', () => {
    const tomas = Array.from({ length: 20 }, (_, i) => toma(i + 1, 14))
    for (const l of groupIntoLotes(tomas)) expect(l.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })

  // Excepción del spec: "Si una única Toma supera 15 segundos, divídela solamente en
  // puntos naturales de acción o diálogo sin alterar el contenido."
  it('parte una toma larga en frases, sin perder texto', () => {
    const larga = toma(1, 80, 'Primera frase completa. Segunda frase completa. Tercera frase completa.')
    const l = groupIntoLotes([larga])
    expect(l.length).toBeGreaterThan(1)
    for (const x of l) expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
    const texto = l.flatMap((x) => x.tomas.map((t) => t.locucion)).join(' ')
    expect(texto).toContain('Primera frase completa')
    expect(texto).toContain('Tercera frase completa')
  })

  it('una toma larga sin puntos igual se acota al tope por lote', () => {
    const l = groupIntoLotes([toma(1, 140, 'una sola frase larguísima sin puntuación alguna')])
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
  it('dos tomas de 15.01 s (30.02 reales) SÍ se parten en dos lotes', () => {
    const l = groupIntoLotes([toma(1, 15.01), toma(2, 15.01)])
    expect(l).toHaveLength(2)
    for (const x of l) expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })

  it('cinco tomas de 6.04 s (30.20 reales) no caben en un solo lote', () => {
    const l = groupIntoLotes(Array.from({ length: 5 }, (_, i) => toma(i + 1, 6.04)))
    expect(l.length).toBeGreaterThan(1)
    for (const x of l) expect(x.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })

  it('quince tomas de 2.04 s (30.60 reales) no caben en un solo lote', () => {
    const l = groupIntoLotes(Array.from({ length: 15 }, (_, i) => toma(i + 1, 2.04)))
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

// El spec pide una cámara POR LOTE que replique el lenguaje visual del original; antes
// se le mandaba a todos el encuadre del corte 1, así que un guión que abría en primer
// plano y cerraba en plano medio salía entero en primer plano.
describe('camaraDeLote', () => {
  const conTiempo = (n: number, dur: number, tiempo: string): TomaFinal => ({ ...toma(n, dur), tiempoOriginal: tiempo })
  const CORTES = [
    { tiempo: '00:00 - 00:06', camara: 'Primer plano, altura de ojos' },
    { tiempo: '00:06 - 00:12', camara: 'Plano medio, cámara fija' },
    { tiempo: '00:12 - 00:20', camara: 'Plano detalle del producto' },
  ]

  it('toma los planos de SUS cortes, no los del primer corte del video', () => {
    const [l1, l2] = groupIntoLotes([
      conTiempo(1, 6, '00:00 - 00:06'), conTiempo(2, 6, '00:06 - 00:12'), conTiempo(3, 6, '00:12 - 00:20'),
    ])
    expect(camaraDeLote(l1, CORTES, 'fallback')).toBe('Primer plano, altura de ojos · Plano medio, cámara fija')
    expect(camaraDeLote(l2, CORTES, 'fallback')).toBe('Plano detalle del producto')
  })

  it('no repite el mismo plano cuando varios cortes lo comparten', () => {
    const cortes = [{ tiempo: 'a', camara: 'Primer plano' }, { tiempo: 'b', camara: 'Primer plano' }]
    const [l] = groupIntoLotes([conTiempo(1, 4, 'a'), conTiempo(2, 4, 'b')])
    expect(camaraDeLote(l, cortes, 'fallback')).toBe('Primer plano')
  })

  // `groupIntoLotes` renumera la secuencia entera tras `splitLongToma`, así que en cuanto
  // una toma se parte el `n` deja de ser el índice de su corte. El emparejamiento va por
  // `tiempoOriginal`, que los fragmentos heredan intacto.
  it('sigue emparejando bien después de que una toma larga se parte en fragmentos', () => {
    const lotes = groupIntoLotes([
      conTiempo(1, 80, '00:00 - 00:22 Primero. Segundo. Tercero.'),
      conTiempo(2, 5, '00:22 - 00:27'),
    ])
    const cortes = [
      { tiempo: '00:00 - 00:22 Primero. Segundo. Tercero.', camara: 'Plano general' },
      { tiempo: '00:22 - 00:27', camara: 'Primer plano' },
    ]
    // Los fragmentos del corte largo siguen resolviendo a "Plano general" pese a que
    // sus `n` ya no son 1 (la renumeración global los corrió).
    expect(camaraDeLote(lotes[0], cortes, 'fallback')).toBe('Plano general')
    expect(camaraDeLote(lotes[lotes.length - 1], cortes, 'fallback')).toContain('Primer plano')
  })

  it('cae al fallback cuando ningún tiempo empareja', () => {
    const [l] = groupIntoLotes([conTiempo(1, 5, 'no existe en cortes')])
    expect(camaraDeLote(l, CORTES, 'primer plano, cámara en mano')).toBe('primer plano, cámara en mano')
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
  const lote = groupIntoLotes([toma(1, 4, 'Hola, te cuento algo.'), toma(2, 4, 'Este suero me cambió la piel.')])[0]
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
    expect(p).toMatch(/NO TEXT \/ NO OVERLAY/)
    expect(p).toMatch(/watermark/i)
    expect(p).toMatch(/captions/i)
  })

  it('numera las imágenes en el orden del array', () => {
    expect(p).toContain('@image(1) = la persona')
    expect(p).toContain('@image(2) = el producto')
    // El orden del array ES el contrato: la leyenda y `anclas` lo asumen (ver la ruta).
    expect(p.indexOf('@image(1)')).toBeLessThan(p.indexOf('@image(2)'))
  })

  it('incluye el perfil de voz completo', () => {
    expect(p).toContain('Limeño')
    expect(p).toContain('Perú - Lima')
  })

  // El spec lista "Iluminación" como bloque obligatorio de cada lote. El `fondo` del
  // forense ya la describe (su prompt la pide ahí), así que lo que faltaba era el
  // rótulo — sacarla a un campo propio obligaría a re-correr el análisis forense de
  // cada sesión guardada, que es el paso caro.
  it('rotula la iluminación junto al escenario', () => {
    expect(p).toContain(`SETTING AND LIGHTING: ${ARGS.escenario}`)
  })

  // Bloque "Continuidad" del spec: qué debe permanecer idéntico durante todo el lote.
  it('declara qué no puede cambiar dentro del clip', () => {
    expect(p).toContain('CONTINUITY:')
    for (const invariante of ['character', 'product', 'wardrobe', 'setting', 'lighting']) {
      expect(p.slice(p.indexOf('CONTINUITY:'), p.indexOf('VOICE AND ACCENT'))).toContain(invariante)
    }
  })

  it('entra en el tope de prompt de KIE', () => {
    expect(p.length).toBeLessThanOrEqual(KIE_PROMPT_MAX)
  })

  it('un lote de muchas tomas también entra en el tope', () => {
    const largo = groupIntoLotes(Array.from({ length: 8 }, (_, i) =>
      toma(i + 1, 1.8, `Frase número ${i + 1} del guión adaptado que dice bastante.`)))[0]
    expect(buildLotePrompt({ lote: largo, ...ARGS }).length).toBeLessThanOrEqual(KIE_PROMPT_MAX)
  })

  // ⚠️ ESTE TEST AFIRMABA "NO RECORTA NADA" Y AHORA AFIRMA LO CONTRARIO, a propósito.
  // Con los 60.000 caracteres de Veo entraba todo; con los 5.000 de grok no entra, y
  // encima los clips pasaron de 8 a 30 s (o sea ~4× las tomas en el mismo prompt). Lo
  // que se fija ahora no es "nada se pierde" sino EL ORDEN EN QUE SE CEDE, que es lo que
  // la escalera de degradación existe para garantizar:
  //
  //   sobreviven  → identidad del personaje, cámara, y la línea hablada de CADA toma
  //   se recortan → el guión global repetido, el párrafo de overlay, la etiqueta del
  //                 producto y, en último lugar, la coreografía
  //
  // La línea hablada por toma es la que nunca se suelta: es la única señal de qué frase
  // va con qué acción y en cuántos segundos. Cuando se perdió en un lote y no en los
  // otros, el resultado medido fue "una habla muy rápido y la otra muy lento".
  it('bajo presión de presupuesto cede en el orden correcto: identidad y diálogo sobreviven', () => {
    const bloqueLargo = 'Mujer de 25 años, latina peruana, cabello negro liso recogido en moño bajo, piel clara, ojos marrón claro, complexión delgada, cejas pobladas naturales, nariz recta, labios medianos, polo blanco de algodón sin estampado ni logo, pantalón deportivo gris, sin joyas visibles, manicura natural, uñas cortas. '.repeat(2)
    const productoLargo = 'Frasco de vidrio celeste translúcido de 30 ml con gotero de plástico blanco, tapa rosca plateada, etiqueta blanca centrada con el texto "EUNOIA" en tipografía serif dorada, borde dorado fino alrededor de la etiqueta, sin otros textos ni logos adicionales. '.repeat(2)
    const accionLarga = 'La modelo empieza de pie frente al espejo del baño con las manos a los costados, gira lentamente el torso hacia la cámara, levanta la mano derecha y toma el frasco del producto desde la repisa con dos dedos, lo sostiene a la altura del pecho, lo inclina levemente para mostrar la etiqueta, mira directo a cámara con expresión cálida y sonríe, termina con el frasco cerca del rostro y la mirada fija en el lente. '

    const argsLargos = { ...ARGS, consistencyBlock: bloqueLargo, productDesc: productoLargo }
    // ⚠️ Con `LOTE_MAX_CHARS` un lote ya no puede llevar 8 líneas largas — el reparto lo
    // impide antes. La presión ahora viene de la COREOGRAFÍA, que es donde va a estar.
    // ⚠️ Un solo lote a propósito: `LOTE_MAX_COREO` ya parte los lotes con demasiada
    // coreografía, así que la presión sobre la escalera hay que construirla dentro de UNO.
    const muchasTomas = {
      ...groupIntoLotes([toma(1, 3, 'Frase número 1 del guión adaptado.')])[0],
      tomas: Array.from({ length: 5 }, (_, i) => ({
        n: i + 1, duracionSeg: 3, accionVisual: accionLarga.repeat(2),
        personaje: 'Mujer 25', producto: 'Frasco', locucion: `Frase número ${i + 1} del guión adaptado.`,
        tiempoOriginal: '00:00 - 00:00',
      })),
    }

    const p = buildLotePrompt({ lote: muchasTomas, ...argsLargos })

    // 1. Entra. Es la razón de ser de la escalera: sin ella esto lanzaría.
    expect(p.length).toBeLessThanOrEqual(KIE_PROMPT_MAX)

    // 2. La identidad del personaje sobrevive ÍNTEGRA. Recortarla es lo que hace que el
    //    lote 3 salga con otra cara que el lote 1, y ese es el fallo que todo el diseño
    //    de contexto absoluto existe para evitar.
    expect(p).toContain(bloqueLargo)
    expect(p).toContain(argsLargos.camara)

    // 3. Las 8 líneas habladas, cada una con su toma. Ninguna se suelta.
    for (let i = 1; i <= 5; i++) expect(p).toContain(`Frase número ${i}`)
    expect([...p.matchAll(/Says/g)]).toHaveLength(5)

    // 4. Y algo SÍ se cedió — si no, este test no estaría probando la escalera.
    const cedioAlgo = p.includes('…') || !p.includes(productoLargo) || !p.includes('FULL SPOKEN SCRIPT')
    expect(cedioAlgo).toBe(true)
  })

  // `duracionSeg` sale de un reparto proporcional y llegaba cruda al prompt: medido,
  // "### Toma 1 — 0.8854477611940298 s". Es ruido y además una precisión que el render
  // no tiene — `snapDuration` le pide a KIE 4, 6 u 8.
  it('no imprime la duración con la basura del float', () => {
    const sucio = groupIntoLotes([{ ...toma(1, 0.8854477611940298), accionVisual: 'gesto' }])[0]
    const p = buildLotePrompt({ lote: sucio, ...ARGS })
    expect(p).toContain('### Shot 1 — 0.9s')
    expect(p).not.toContain('0.8854477611940298')
  })

  it('la cámara que recibe es la que sale en el prompt, no una fija del video', () => {
    expect(buildLotePrompt({ lote, ...ARGS, camara: 'Plano medio, cámara fija en trípode' }))
      .toContain('CAMERA: Plano medio, cámara fija en trípode.')
  })

  it('si ni el bloque de consistencia por sí solo entra en el tope, lanza un error explicando el exceso', () => {
    const bloqueImposible = 'x'.repeat(KIE_PROMPT_MAX * 2)
    expect(() => buildLotePrompt({ lote, ...ARGS, consistencyBlock: bloqueImposible })).toThrow()
    expect(() => buildLotePrompt({ lote, ...ARGS, consistencyBlock: bloqueImposible }))
      .toThrow(new RegExp(String(KIE_PROMPT_MAX)))
  })
})

/**
 * El plano POR TOMA y el presupuesto que lo paga.
 *
 * `camaraDeLote` deduplica y concatena los planos del lote en un solo string; con dos
 * planos distintos esa línea no dice cuál va con cuál, y de ahí sale "no copió el plano
 * en el que aparece la persona". Pero cada carácter que gasta se lo quita a
 * `accionVisual`, que es lo ÚNICO que se trunca bajo presión de presupuesto y la otra
 * mitad de la misma queja ("que se copien los movimientos exactos").
 */
// El tercer artefacto bloqueado, junto al bloque de consistencia y la voz. Va en CADA
// lote por la misma REGLA DE CONTEXTO ABSOLUTO: un personaje que se mueve distinto en el
// lote 3 que en el 1 es el mismo fallo que uno que cambia de cara.
// ⚠️ EL MODO KEYFRAMES SE ELIMINÓ con la vuelta a grok (2026-08-24). Ya no hay un par de
// fotogramas que definan la escena, así que el escenario vuelve a viajar como texto en
// TODOS los lotes: es lo único que la define.
//
// La deuda que esto reabre está documentada y es real: `forensic.fondo` describe el VIDEO
// ENTERO y ninguna limpieza de texto lo acota a un clip (medido, el campo `texturas` de la
// sesión de ropa decía "Paredes lisas, tela suave del sillón, baldosas pulidas", con el
// sillón a mitad de frase). Lo que la contiene ahora es otra cosa: las IMÁGENES ANCLA le
// dan al modelo la escena en píxeles, que le gana a cualquier descripción.
describe('buildLotePrompt — el escenario', () => {
  const lote = groupIntoLotes([toma(1, 4, 'Hola.')])[0]
  const conSillon = 'Pared lisa. Paredes lisas, tela suave del sillón, baldosas pulidas.'

  it('manda la descripción del fondo: es lo único que define la escena', () => {
    const p = buildLotePrompt({ lote, ...ARGS, escenario: conSillon })
    expect(p).toContain(conSillon)
    expect(p).toContain('SETTING AND LIGHTING')
  })
})

describe('buildLotePrompt — cómo se mueve', () => {
  const movimiento = {
    calidadMovimiento: 'Movimientos lentos y continuos, sin pausas bruscas entre gestos.',
    manerismos: 'Se acomoda el pelo detrás de la oreja al empezar cada frase.',
  }
  const lote = groupIntoLotes([toma(1, 4, 'Hola.')])[0]

  it('repite el perfil íntegro, los dos campos', () => {
    const p = buildLotePrompt({ lote, ...ARGS, movimiento })
    expect(p).toContain(movimiento.calidadMovimiento)
    expect(p).toContain(movimiento.manerismos)
    // Y dice que vale ENTRE gesto y gesto, que es justo lo que `accionVisual` no cubre.
    expect(p).toMatch(/between gestures/)
  })

  it('sin perfil no emite el bloque — las sesiones anteriores se comportan igual', () => {
    const p = buildLotePrompt({ lote, ...ARGS })
    expect(p).not.toMatch(/HOW THEY MOVE/)
    expect(buildLotePrompt({ lote, ...ARGS, movimiento: null })).toBe(p)
  })
})

describe('buildLotePrompt — plano por toma', () => {
  const DOS_PLANOS = [
    { tiempo: 't1', camara: 'Plano medio frontal, estático' },
    { tiempo: 't2', camara: 'Plano medio frontal, estático' },
    { tiempo: 't3', camara: 'Primer plano del rostro' },
  ]
  const conT = (n: number, dur: number, tiempo: string): TomaFinal => ({ ...toma(n, dur), tiempoOriginal: tiempo })
  const lote = groupIntoLotes([conT(1, 2, 't1'), conT(2, 2, 't2'), conT(3, 2, 't3')])[0]

  it('anuncia el plano solo cuando CAMBIA — no en cada toma', () => {
    const p = buildLotePrompt({ lote, ...ARGS, cortes: DOS_PLANOS })
    expect([...p.matchAll(/^Camera: /gm)]).toHaveLength(2)
    expect(p).toContain('Camera: Plano medio frontal, estático')
    expect(p).toContain('Camera: Primer plano del rostro')
  })

  it('no gasta presupuesto cuando todo el lote comparte un plano — la línea global ya lo dice', () => {
    const unSoloPlano = DOS_PLANOS.map((c) => ({ ...c, camara: 'Plano medio' }))
    const p = buildLotePrompt({ lote, ...ARGS, cortes: unSoloPlano })
    expect(p).not.toMatch(/^Camera: /m)
    // La línea global (que viene por `camara`, ya deduplicada por `camaraDeLote`) sigue ahí.
    expect(p).toContain(`CAMERA: ${ARGS.camara}`)
  })

  it('sin cortes se comporta como antes (sesiones y callers que no los pasan)', () => {
    expect(buildLotePrompt({ lote, ...ARGS })).not.toMatch(/^Camera: /m)
  })
})

describe('groupIntoLotes — frontera de plano', () => {
  const conT = (n: number, dur: number, tiempo: string): TomaFinal => ({ ...toma(n, dur), tiempoOriginal: tiempo })
  const MAPA = new Map([
    ['t1', 'Plano medio frontal'], ['t2', 'Plano medio frontal'],
    ['t3', 'Primer plano del rostro'], ['t4', 'Plano general'],
  ])

  it('cierra el lote cuando cambia el encuadre, aunque sobre tiempo', () => {
    const tomas = [conT(1, 2, 't1'), conT(2, 2, 't2'), conT(3, 2, 't3'), conT(4, 2, 't4')]
    // Sin el mapa los 8 s entran holgados en un solo lote.
    expect(groupIntoLotes(tomas)).toHaveLength(1)
    // ⚠️ Y CON el mapa TAMBIÉN, porque el default pasó a ser "sin límite de encuadres":
    // con 30 s de techo y las imágenes ancla, concatenar escenas es lo que se quiere.
    expect(groupIntoLotes(tomas, MAPA)).toHaveLength(1)
    // La frontera sigue existiendo y se pide explícitamente — es el dial de costo.
    const lotes = groupIntoLotes(tomas, MAPA, 1)
    expect(lotes.map((l) => l.tomas.length)).toEqual([2, 1, 1])
  })

  it('cada lote queda con un solo encuadre', () => {
    const lotes = groupIntoLotes([conT(1, 2, 't1'), conT(2, 2, 't3'), conT(3, 2, 't2')], MAPA, 1)
    for (const l of lotes) {
      expect(new Set(l.tomas.map((t) => MAPA.get(t.tiempoOriginal))).size).toBe(1)
    }
    // Un plano que vuelve más adelante abre su propio lote, igual que en el original.
    expect(lotes).toHaveLength(3)
  })

  it('sigue respetando el tope de 15 s dentro de un mismo encuadre', () => {
    const mismo = new Map([['t', 'Plano medio']])
    const lotes = groupIntoLotes(Array.from({ length: 5 }, (_, i) => conT(i + 1, 14, 't')), mismo)
    expect(lotes.length).toBeGreaterThan(1)
    for (const l of lotes) expect(l.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })

  it('sin mapa se comporta exactamente como antes', () => {
    const tomas = [conT(1, 2, 't1'), conT(2, 2, 't3'), conT(3, 2, 't4')]
    expect(groupIntoLotes(tomas)).toEqual(groupIntoLotes(tomas, undefined))
  })
})

/**
 * `maxPlanos` — el eje costo/fidelidad, medido sobre dos videos reales.
 *
 * Con 1 el original manda el corte. Con más, el clip puede contener varios encuadres,
 * lo que baja el número de llamadas pagadas… y devuelve el problema que la frontera
 * existe para arreglar: un clip con dos planos se renderiza con uno solo (comprobado
 * con renders reales). Medido sobre un UGC de ropa de 29 cortes: K=2 deja 11 de 12
 * lotes con encuadre ambiguo, K=3 deja 7 de 7. O sea K>1 compra costo con encuadre.
 *
 * Se queda en 1 por defecto: cambiarlo es una decisión de plata, no un default.
 */
describe('groupIntoLotes — maxPlanos', () => {
  const conT = (n: number, dur: number, tiempo: string): TomaFinal => ({ ...toma(n, dur), tiempoOriginal: tiempo })
  const MAPA = new Map([['a', 'Plano medio'], ['b', 'Primer plano'], ['c', 'Plano general']])
  const TOMAS = [conT(1, 2, 'a'), conT(2, 2, 'b'), conT(3, 2, 'c'), conT(4, 2, 'a')]

  // ⚠️ EL DEFAULT SE INVIRTIÓ (2026-08-24): era 1 (un encuadre por clip, máxima fidelidad
  // y máximo costo) y pasa a ser "sin límite". La medición que justificaba el 1 seguía
  // siendo cierta pero su PREMISA cambió: se hizo sobre Veo, sin imágenes ancla, y ahí un
  // clip con dos encuadres devolvía uno solo. Ahora cada escena lleva su propio fotograma
  // de referencia y el prompt describe el corte entre ellas.
  it('el default ya NO corta por encuadre: concatena escenas en un mismo clip', () => {
    expect(groupIntoLotes(TOMAS, MAPA)).toHaveLength(1)
    // El comportamiento viejo sigue disponible pidiéndolo explícitamente.
    expect(groupIntoLotes(TOMAS, MAPA, 1)).toHaveLength(4)
  })

  it('K=2 admite dos encuadres por clip y nunca un tercero', () => {
    const lotes = groupIntoLotes(TOMAS, MAPA, 2)
    expect(lotes).toHaveLength(2)
    for (const l of lotes) {
      expect(new Set(l.tomas.map((t) => MAPA.get(t.tiempoOriginal))).size).toBeLessThanOrEqual(2)
    }
  })

  // Un plano que YA está en el lote no consume cupo: lo que se cuenta son encuadres
  // distintos, no cortes. Si no, "a b a" gastaría tres.
  it('repetir un encuadre ya presente no consume cupo', () => {
    const lotes = groupIntoLotes([conT(1, 2, 'a'), conT(2, 2, 'b'), conT(3, 2, 'a')], MAPA, 2)
    expect(lotes).toHaveLength(1)
  })

  it('el tope de duración sigue mandando por encima de maxPlanos', () => {
    const largo = Array.from({ length: 6 }, (_, i) => conT(i + 1, 14, 'a'))
    for (const l of groupIntoLotes(largo, MAPA, 9)) expect(l.duracionSeg).toBeLessThanOrEqual(LOTE_MAX_SEC)
  })
})

/**
 * VARIOS PERSONAJES en el render (slice 4). Un bloque por persona presente y la locución
 * atribuida. Lo primero que se prueba es que el camino de UNO no cambió: si cambiara,
 * cambiarían todas las sesiones guardadas a la vez.
 */
describe('buildLotePrompt — varios personajes', () => {
  const pers = (id: string, rol: string) => ({
    id, rol, desc: '', etnia: '', acento: '', voz: '', fotoUrl: null,
    avatarUrl: `https://cdn/${id}.png`,
    consistencyBlock: `Bloque de ${rol}`,
    voiceProfile: { ...VOZ, acento: `acento de ${rol}` },
    motionProfile: { calidadMovimiento: `movimiento de ${rol}`, manerismos: `tics de ${rol}` },
  })
  const hijo = pers('P1', 'hijo')
  const padre = pers('P2', 'padre')
  const conT = (n: number, dur: number, tiempo: string, loc: string) =>
    ({ ...toma(n, dur, loc), tiempoOriginal: tiempo })

  it('SIN atribución el prompt es IDÉNTICO al de antes — ninguna sesión guardada cambia', () => {
    const l = groupIntoLotes([conT(1, 4, 't1', 'Hola.')])[0]
    const antes = buildLotePrompt({ lote: l, ...ARGS })
    const conLista = buildLotePrompt({ lote: l, ...ARGS, personajes: [hijo, padre] })
    expect(conLista).toBe(antes)
  })

  it('con UN hablante atribuido nombra quién habla y no duplica bloques', () => {
    const l = groupIntoLotes([conT(1, 4, 't1', 'Hola.')])[0]
    const quien = new Map([['t1', [hijo]]])
    const p = buildLotePrompt({ lote: l, ...ARGS, personajes: [hijo, padre], quien })
    expect(p).toContain('P1 (hijo) says: “Hola.”')
    // Un solo presente: sigue el formato de siempre, sin el encabezado de varios.
    expect(p).not.toMatch(/THERE ARE \d+ PEOPLE/)
    expect(p).toContain('VOICE PROFILE:')
  })

  it('con DOS presentes emite un bloque por persona y atribuye cada línea', () => {
    const l = groupIntoLotes([conT(1, 4, 't1', 'Papá, lo logré.'), conT(2, 4, 't2', 'Estoy orgulloso.')])[0]
    const quien = new Map([['t1', [hijo]], ['t2', [padre]]])
    const p = buildLotePrompt({ lote: l, ...ARGS, personajes: [hijo, padre], quien })

    expect(p).toMatch(/THERE ARE 2 PEOPLE IN THIS CLIP/)
    expect(p).toContain('CHARACTER P1 (hijo)')
    expect(p).toContain('CHARACTER P2 (padre)')
    expect(p).toContain('Bloque de hijo')
    expect(p).toContain('Bloque de padre')
    // Cada uno con SU voz y SU movimiento: darle a uno la voz del otro es el fallo.
    expect(p).toContain('acento de hijo')
    expect(p).toContain('acento de padre')
    expect(p).toContain('movimiento de padre')
    // Y cada línea dicha por quien corresponde.
    expect(p).toContain('P1 (hijo) says: “Papá, lo logré.”')
    expect(p).toContain('P2 (padre) says: “Estoy orgulloso.”')
  })

  it('con varios NO manda el bloque global de voz: cada uno lleva la suya', () => {
    const l = groupIntoLotes([conT(1, 4, 't1', 'a'), conT(2, 4, 't2', 'b')])[0]
    const quien = new Map([['t1', [hijo]], ['t2', [padre]]])
    const p = buildLotePrompt({ lote: l, ...ARGS, personajes: [hijo, padre], quien })
    // Un perfil global contradiría los dos de arriba: el modelo no sabría cuál usar.
    expect(p).not.toContain('VOICE PROFILE:')
    expect(p).toMatch(/do not give one the other’s voice/)
  })

  it('una toma con DOS hablantes no se atribuye a uno solo', () => {
    const l = groupIntoLotes([conT(1, 4, 't1', 'Tome. No se preocupe.')])[0]
    const quien = new Map([['t1', [hijo, padre]]])
    const p = buildLotePrompt({ lote: l, ...ARGS, personajes: [hijo, padre], quien })
    expect(p).toContain('Says: “Tome. No se preocupe.”')
    expect(p).not.toContain('P1 (hijo) says')
  })
})

/**
 * VOZ EN OFF. Un formato entero de UGC narra por encima de b-roll sin que quien habla
 * aparezca: medido con un anuncio real de calzado, 62 s de narración sobre planos de pies
 * y de manos, sin que la cara salga ni una vez. Sin esto el render pone a un avatar a
 * hacer lip-sync de esa narración, que es justo lo que el original NO hace.
 */
describe('buildLotePrompt — voz en off', () => {
  const conT = (n: number, tiempo: string, loc: string) =>
    ({ ...toma(n, 4, loc), tiempoOriginal: tiempo })

  it('la línea no se le atribuye a nadie en cuadro', () => {
    const l = groupIntoLotes([conT(1, 't1', 'Este modelo se agotó en un día.')])[0]
    const p = buildLotePrompt({ lote: l, ...ARGS, vozEnOff: new Set(['t1']) })
    expect(p).toContain('VOICE-OVER (nobody on camera): “Este modelo se agotó en un día.”')
    expect(p).not.toMatch(/^Says/m)
  })

  it('declara que ninguna boca se mueve — es lo que evita el lip-sync', () => {
    const l = groupIntoLotes([conT(1, 't1', 'Hola.')])[0]
    const p = buildLotePrompt({ lote: l, ...ARGS, vozEnOff: new Set(['t1']) })
    expect(p).toMatch(/NO mouth moves in this clip/)
    expect(p).toMatch(/there is no/)
    expect(p).toMatch(/FULL VOICE-OVER SCRIPT/)
  })

  it('un lote MIXTO no se declara en off: alguien sí habla en cuadro', () => {
    const l = groupIntoLotes([conT(1, 't1', 'Mirá esto.'), conT(2, 't2', 'Se agotó.')])[0]
    const p = buildLotePrompt({ lote: l, ...ARGS, vozEnOff: new Set(['t2']) })
    expect(p).not.toMatch(/NO mouth moves in this clip/)
    // …pero cada línea conserva su propio rótulo.
    expect(p).toContain('Says: “Mirá esto.”')
    expect(p).toContain('VOICE-OVER (nobody on camera): “Se agotó.”')
  })

  it('sin el set el prompt es IDÉNTICO al de antes', () => {
    const l = groupIntoLotes([conT(1, 't1', 'Hola.')])[0]
    expect(buildLotePrompt({ lote: l, ...ARGS, vozEnOff: new Set() }))
      .toBe(buildLotePrompt({ lote: l, ...ARGS }))
  })
})

describe('repartirAccion', () => {
  const a = 'Destapa el frasco Luego, aplica en la mejilla Luego, vuelve a taparlo'

  // ⚠️ EL DEFECTO QUE MOTIVÓ ESTO: `splitLongToma` copiaba la coreografía ENTERA a cada
  // fragmento, o sea le pedía al modelo los 17 s de movimiento en 3 s y otra vez en 8,7 s.
  // Medido sobre la base: 21 de 119 tomas.
  it('nunca deja un fragmento vacío teniendo tramos que darle', () => {
    for (const durs of [[9, 1], [1, 9], [5, 5, 5], [10, 1, 1]]) {
      const out = repartirAccion(a, durs)
      if (durs.length <= 3) for (const x of out) expect(x).not.toBe('')
      expect(out.join(' ').split('Luego,').length + out.filter(Boolean).length - 1).toBeGreaterThanOrEqual(3)
    }
  })

  it('reparte los tramos entre los fragmentos, nunca los duplica', () => {
    const out = repartirAccion(a, [5, 5, 5])
    expect(out).toEqual(['Destapa el frasco', 'aplica en la mejilla', 'vuelve a taparlo'])
    expect(new Set(out).size).toBe(3)
  })

  it('reparte proporcionalmente a la duración', () => {
    const [uno, dos] = repartirAccion(a, [9, 1])
    expect(uno).toContain('Destapa el frasco')
    expect(uno).toContain('aplica en la mejilla')
    expect(dos).toBe('vuelve a taparlo')
  })

  // Sin separador no hay tramos que repartir: la acción va al PRIMERO y los demás quedan
  // sin línea. Una acción vacía omite una línea del prompt; una duplicada le pide al
  // modelo hacer dos veces lo mismo en la mitad del tiempo.
  it('sin separador la acción va al primer fragmento y no se copia', () => {
    expect(repartirAccion('Sostiene el frasco', [5, 5])).toEqual(['Sostiene el frasco', ''])
  })

  it('un solo fragmento devuelve la acción intacta', () => {
    expect(repartirAccion(a, [10])).toEqual([a])
  })
})

describe('buildLotePrompt — el estado de las piezas', () => {
  const manos = { inicio: 'frasco', fin: 'frasco', accesorios: 'tapa puesta → tapa fuera → tapa puesta' }
  const lote = groupIntoLotes([{ ...toma(1, 6, 'Hola.'), tiempoOriginal: 't1' }])[0]
  const p = buildLotePrompt({
    lote, ...ARGS,
    cortes: [{ tiempo: 't1', camara: 'Primer plano', objetoEnMano: manos }],
  })

  // "la tapa reaparece mágicamente en el frasco": el modelo no puede conservar el estado
  // de una pieza que nadie le nombró. Es lo único que `micro.manos` no puede decir, porque
  // es un estado que VUELVE.
  it('emite el estado de la tapa', () => {
    expect(p).toContain('tapa puesta → tapa fuera → tapa puesta')
    expect(p).toMatch(/never appear or vanish on their own/)
  })

  // El recorrido por mano ya no tiene campos propios: vive en `micro.manos`, que es donde
  // el modelo lo escribía por su cuenta mientras los campos volvían vacíos.
  it('el recorrido por mano llega por micro.manos', () => {
    const micro = { cuerpo: 'torso quieto', manos: 'izquierda: sostiene frasco · derecha: destapa → aplica', rostro: 'sonríe', cabello: 'fijo', entorno: 'quieto' }
    const q = buildLotePrompt({ lote, ...ARGS, cortes: [{ tiempo: 't1', camara: 'Primer plano', micro }] })
    expect(q).toContain('hands izquierda: sostiene frasco · derecha: destapa → aplica')
  })
})

describe('buildLotePrompt — las referencias no son tomas', () => {
  // Medido en un render real: el producto salió FLOTANDO a pantalla completa. La leyenda
  // decía qué ES cada imagen y nada sobre cómo puede usarse.
  it('declara que las imágenes definen apariencia, no una toma a reproducir', () => {
    const p = buildLotePrompt({ lote: groupIntoLotes([toma(1, 5)])[0], ...ARGS })
    expect(p).toMatch(/APPEARANCE ONLY/)
    expect(p).toMatch(/floating cut-out/)
  })
})

describe('buildLotePrompt — la puesta en cuadro', () => {
  // ⚠️ `Micro.posicion` se ELIMINÓ: volvió vacía en 3 corridas porque solapa con `camara`,
  // que el forense llena 5/5. El vocabulario de encuadre se pide dentro de `camara` y llega
  // por la línea CAMERA que ya existía.
  it('llega por la línea de cámara, que el forense sí llena', () => {
    const p = buildLotePrompt({ lote: groupIntoLotes([toma(1, 5)])[0], ...ARGS, camara: 'Primer plano, persona centrada, frasco en el tercio derecho' })
    expect(p).toContain('CAMERA: Primer plano, persona centrada, frasco en el tercio derecho')
  })
})

describe('groupIntoLotes — la clase de toma cierra el lote', () => {
  const conClase = (n: number, dur: number, t: string, loc = `linea ${n}`) => ({ ...toma(n, dur, loc), tiempoOriginal: t })

  // ⚠️ EL CASO MEDIDO: el original dedica 8 segundos seguidos al frasco casi a pantalla
  // completa, y esa toma compartió clip con una toma hablada de 19 s. En un clip con 371
  // caracteres de locución el modelo se pasa el tiempo hablando: el beat de producto quedó
  // en ~1,5 s de los 8. Le pasa a cualquier b-roll de cualquier UGC.
  it('una toma de producto no comparte clip con una de persona', () => {
    const clase = new Map([['t1', true], ['t2', false], ['t3', true]])
    const l = groupIntoLotes(
      [conClase(1, 4, 't1'), conClase(2, 3, 't2', ''), conClase(3, 4, 't3')],
      undefined, undefined, clase,
    )
    expect(l).toHaveLength(3)
    expect(l[1].tomas.map((t) => t.tiempoOriginal)).toEqual(['t2'])
  })

  it('dos tomas de la misma clase siguen compartiendo clip', () => {
    const clase = new Map([['t1', true], ['t2', true]])
    const l = groupIntoLotes([conClase(1, 4, 't1'), conClase(2, 4, 't2')], undefined, undefined, clase)
    expect(l).toHaveLength(1)
  })

  // Sin el mapa, el comportamiento es exactamente el de antes.
  it('sin clasePorTiempo agrupa como siempre', () => {
    const l = groupIntoLotes([conClase(1, 4, 't1'), conClase(2, 3, 't2'), conClase(3, 4, 't3')])
    expect(l).toHaveLength(1)
  })
})

describe('groupIntoLotes — presupuesto de coreografía', () => {
  const conAccion = (n: number, dur: number, accion: string) => ({ ...toma(n, dur), accionVisual: accion })

  // ⚠️ MEDIDO sobre 125 lotes: los que llegaban con la coreografía truncada pedían 1332
  // caracteres contra 259 los sanos. El truncado no era aleatorio — pasaba justo en los
  // lotes con MÁS movimiento que copiar, que son los que importan.
  it('cierra el lote cuando la coreografía acumulada no va a entrar', () => {
    const larga = 'x'.repeat(600)
    const l = groupIntoLotes([conAccion(1, 3, larga), conAccion(2, 3, larga)])
    expect(l).toHaveLength(2)
  })

  it('no lo cierra cuando la coreografía es normal', () => {
    const l = groupIntoLotes([conAccion(1, 3, 'x'.repeat(200)), conAccion(2, 3, 'x'.repeat(200))])
    expect(l).toHaveLength(1)
  })

  // Una toma que SOLA se pasa del presupuesto se queda en su lote: cerrar no ayuda, y es
  // la misma jerarquía que con la duración y con los caracteres de habla.
  it('una sola toma que se pasa sigue en su lote', () => {
    expect(groupIntoLotes([conAccion(1, 5, 'x'.repeat(LOTE_MAX_COREO + 300))])).toHaveLength(1)
  })
})
