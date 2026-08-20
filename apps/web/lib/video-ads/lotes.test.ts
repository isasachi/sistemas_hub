import { describe, it, expect } from 'vitest'
import { groupIntoLotes, LOTE_MAX_SEC, LoteSchema, buildLotePrompt, camaraDeLote } from './lotes'
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
    const l = groupIntoLotes([toma(1, 4), toma(2, 4), toma(3, 4)])
    expect(l).toHaveLength(2)
    expect(l[0].tomas.map((t) => t.n)).toEqual([1, 2])
    expect(l[0].duracionSeg).toBe(8)
    expect(l[1].tomas.map((t) => t.n)).toEqual([3])
    expect(l[1].duracionSeg).toBe(4)
  })

  it('permite el lote que suma exactamente el tope', () => {
    const l = groupIntoLotes([toma(1, 4), toma(2, 4), toma(3, 1)])
    expect(l[0].tomas.map((t) => t.n)).toEqual([1, 2])
    expect(l[0].duracionSeg).toBe(LOTE_MAX_SEC)
    expect(l[1].tomas.map((t) => t.n)).toEqual([3])
  })

  it('numera los lotes desde 1 y en orden', () => {
    const l = groupIntoLotes([toma(1, 8), toma(2, 8), toma(3, 8)])
    expect(l.map((x) => x.n)).toEqual([1, 2, 3])
  })

  it('nunca produce un lote de más largo que el tope', () => {
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
      conTiempo(1, 4, '00:00 - 00:06'), conTiempo(2, 4, '00:06 - 00:12'), conTiempo(3, 8, '00:12 - 00:20'),
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
      conTiempo(1, 22, '00:00 - 00:22 Primero. Segundo. Tercero.'),
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

  // El spec lista "Iluminación" como bloque obligatorio de cada lote. El `fondo` del
  // forense ya la describe (su prompt la pide ahí), así que lo que faltaba era el
  // rótulo — sacarla a un campo propio obligaría a re-correr el análisis forense de
  // cada sesión guardada, que es el paso caro.
  it('rotula la iluminación junto al escenario', () => {
    expect(p).toContain(`ESCENARIO E ILUMINACIÓN: ${ARGS.escenario}`)
  })

  // Bloque "Continuidad" del spec: qué debe permanecer idéntico durante todo el lote.
  it('declara qué no puede cambiar dentro del clip', () => {
    expect(p).toContain('CONTINUIDAD:')
    for (const invariante of ['personaje', 'producto', 'vestuario', 'escenario', 'iluminación']) {
      expect(p.slice(p.indexOf('CONTINUIDAD:'), p.indexOf('PERFIL DE VOZ'))).toContain(invariante)
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

  // Fix round 1 — el test anterior usa `accionVisual` sintético de ~9 caracteres
  // (`accion ${n}`), muy por debajo del detalle forense real (AGENTS.md: ~6300 chars
  // con ~11 beats). Este caso fuerza la degradación de verdad: bloque de consistencia
  // y descripción de producto verbosos, y 8 tomas con `accionVisual` largo (secuencial:
  // posición inicial, movimiento, manos, mirada, expresión, posición final).
  it('con contenido de tamaño realista NO recorta nada — ni la coreografía ni el guión', () => {
    // Este es el caso que con grok forzaba la degradación: bloque de consistencia y
    // producto verbosos, y 8 tomas con `accionVisual` secuencial completa (posición
    // inicial, movimiento, manos, mirada, expresión, posición final). En 4096 caracteres
    // la coreografía se truncaba a mitad de palabra —medido: 78 de 266 por toma— y era
    // la causa mecánica de "no copia los movimientos". Con los 60.000 de Veo entra todo.
    const bloqueLargo = 'Mujer de 25 años, latina peruana, cabello negro liso recogido en moño bajo, piel clara, ojos marrón claro, complexión delgada, cejas pobladas naturales, nariz recta, labios medianos, polo blanco de algodón sin estampado ni logo, pantalón deportivo gris, sin joyas visibles, manicura natural, uñas cortas. '.repeat(2)
    const productoLargo = 'Frasco de vidrio celeste translúcido de 30 ml con gotero de plástico blanco, tapa rosca plateada, etiqueta blanca centrada con el texto "EUNOIA" en tipografía serif dorada, borde dorado fino alrededor de la etiqueta, sin otros textos ni logos adicionales. '.repeat(2)
    const accionLarga = 'La modelo empieza de pie frente al espejo del baño con las manos a los costados, gira lentamente el torso hacia la cámara, levanta la mano derecha y toma el frasco del producto desde la repisa con dos dedos, lo sostiene a la altura del pecho, lo inclina levemente para mostrar la etiqueta, mira directo a cámara con expresión cálida y sonríe, termina con el frasco cerca del rostro y la mirada fija en el lente. '

    const argsLargos = { ...ARGS, consistencyBlock: bloqueLargo, productDesc: productoLargo }
    const muchasTomas = groupIntoLotes(Array.from({ length: 8 }, (_, i) =>
      ({ ...toma(i + 1, 1, `Frase número ${i + 1} del guión adaptado, bastante larga también, para sumar presión de caracteres sobre el presupuesto del prompt.`), accionVisual: accionLarga })))[0]

    const p = buildLotePrompt({ lote: muchasTomas, ...argsLargos })
    expect(p.length).toBeLessThanOrEqual(KIE_PROMPT_MAX)
    expect(p).toContain(argsLargos.camara)
    expect(p).toContain(bloqueLargo)
    expect(p).toContain(productoLargo)
    // Lo que antes se perdía: la coreografía COMPLETA de cada toma, sin puntos suspensivos.
    expect(p).not.toContain('…')
    for (const t of muchasTomas.tomas) expect(p).toContain(t.accionVisual)
    // Y el guión global, que era lo primero que se soltaba bajo presión.
    expect(p).toContain('GUION DE LOCUCIÓN FINAL')
    expect(p).toContain('Locución: “Frase número 8')
    for (let i = 1; i <= 8; i++) expect(p).toContain(`Frase número ${i}`)
  })

  // `duracionSeg` sale de un reparto proporcional y llegaba cruda al prompt: medido,
  // "### Toma 1 — 0.8854477611940298 s". Es ruido y además una precisión que el render
  // no tiene — `snapDuration` le pide a KIE 4, 6 u 8.
  it('no imprime la duración con la basura del float', () => {
    const sucio = groupIntoLotes([{ ...toma(1, 0.8854477611940298), accionVisual: 'gesto' }])[0]
    const p = buildLotePrompt({ lote: sucio, ...ARGS })
    expect(p).toContain('### Toma 1 — 0.9 s')
    expect(p).not.toContain('0.8854477611940298')
  })

  it('la cámara que recibe es la que sale en el prompt, no una fija del video', () => {
    expect(buildLotePrompt({ lote, ...ARGS, camara: 'Plano medio, cámara fija en trípode' }))
      .toContain('CÁMARA: Plano medio, cámara fija en trípode.')
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
// ⚠️ `forensic.fondo` describe el VIDEO ENTERO y ninguna limpieza de texto lo acota a un
// clip: filtrar los valores que empiezan describiendo otro corte deja pasar los que lo
// mencionan a mitad de frase — medido, el campo `texturas` de la sesión de ropa decía
// "Paredes lisas, tela suave del sillón, baldosas pulidas". Con keyframes el escenario
// son las dos imágenes, así que describirlo otra vez solo puede contradecirlas.
describe('buildLotePrompt — el escenario en modo frames', () => {
  const lote = groupIntoLotes([toma(1, 4, 'Hola.')])[0]
  const conSillon = 'Pared lisa. Paredes lisas, tela suave del sillón, baldosas pulidas.'

  it('con keyframes NO manda la descripción del fondo — la mandan los fotogramas', () => {
    const p = buildLotePrompt({ lote, ...ARGS, escenario: conSillon, mode: 'frames' })
    expect(p).not.toContain('sillón')
    expect(p).toMatch(/exactamente los del primer y el último fotograma/)
  })

  it('sin keyframes sigue mandándola: ahí es lo único que define la escena', () => {
    const p = buildLotePrompt({ lote, ...ARGS, escenario: conSillon })
    expect(p).toContain(conSillon)
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
    expect(p).toMatch(/entre gesto y gesto/)
  })

  it('sin perfil no emite el bloque — las sesiones anteriores se comportan igual', () => {
    const p = buildLotePrompt({ lote, ...ARGS })
    expect(p).not.toMatch(/CÓMO SE MUEVE/)
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
    expect([...p.matchAll(/^Cámara: /gm)]).toHaveLength(2)
    expect(p).toContain('Cámara: Plano medio frontal, estático')
    expect(p).toContain('Cámara: Primer plano del rostro')
  })

  it('no gasta presupuesto cuando todo el lote comparte un plano — la línea global ya lo dice', () => {
    const unSoloPlano = DOS_PLANOS.map((c) => ({ ...c, camara: 'Plano medio' }))
    const p = buildLotePrompt({ lote, ...ARGS, cortes: unSoloPlano })
    expect(p).not.toMatch(/^Cámara: /m)
    // La línea global (que viene por `camara`, ya deduplicada por `camaraDeLote`) sigue ahí.
    expect(p).toContain(`CÁMARA: ${ARGS.camara}`)
  })

  it('sin cortes se comporta como antes (sesiones y callers que no los pasan)', () => {
    expect(buildLotePrompt({ lote, ...ARGS })).not.toMatch(/^Cámara: /m)
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
    // Con el mapa: un lote por encuadre, y las dos tomas del mismo plano siguen juntas.
    const lotes = groupIntoLotes(tomas, MAPA)
    expect(lotes.map((l) => l.tomas.length)).toEqual([2, 1, 1])
  })

  it('cada lote queda con un solo encuadre', () => {
    const lotes = groupIntoLotes([conT(1, 2, 't1'), conT(2, 2, 't3'), conT(3, 2, 't2')], MAPA)
    for (const l of lotes) {
      expect(new Set(l.tomas.map((t) => MAPA.get(t.tiempoOriginal))).size).toBe(1)
    }
    // Un plano que vuelve más adelante abre su propio lote, igual que en el original.
    expect(lotes).toHaveLength(3)
  })

  it('sigue respetando el tope de 15 s dentro de un mismo encuadre', () => {
    const mismo = new Map([['t', 'Plano medio']])
    const lotes = groupIntoLotes(Array.from({ length: 5 }, (_, i) => conT(i + 1, 4, 't')), mismo)
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

  it('el default es 1: un encuadre por clip', () => {
    expect(groupIntoLotes(TOMAS, MAPA)).toEqual(groupIntoLotes(TOMAS, MAPA, 1))
    expect(groupIntoLotes(TOMAS, MAPA)).toHaveLength(4)
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

  it('el tope de 15 s sigue mandando por encima de maxPlanos', () => {
    const largo = Array.from({ length: 6 }, (_, i) => conT(i + 1, 4, 'a'))
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
    expect(p).toContain('P1 (hijo) dice: “Hola.”')
    // Un solo presente: sigue el formato de siempre, sin el encabezado de varios.
    expect(p).not.toMatch(/EN ESTE CLIP SALEN/)
    expect(p).toContain('PERFIL DE VOZ Y ACENTO:')
  })

  it('con DOS presentes emite un bloque por persona y atribuye cada línea', () => {
    const l = groupIntoLotes([conT(1, 4, 't1', 'Papá, lo logré.'), conT(2, 4, 't2', 'Estoy orgulloso.')])[0]
    const quien = new Map([['t1', [hijo]], ['t2', [padre]]])
    const p = buildLotePrompt({ lote: l, ...ARGS, personajes: [hijo, padre], quien })

    expect(p).toMatch(/EN ESTE CLIP SALEN 2 PERSONAS/)
    expect(p).toContain('PERSONAJE P1 (hijo)')
    expect(p).toContain('PERSONAJE P2 (padre)')
    expect(p).toContain('Bloque de hijo')
    expect(p).toContain('Bloque de padre')
    // Cada uno con SU voz y SU movimiento: darle a uno la voz del otro es el fallo.
    expect(p).toContain('acento de hijo')
    expect(p).toContain('acento de padre')
    expect(p).toContain('movimiento de padre')
    // Y cada línea dicha por quien corresponde.
    expect(p).toContain('P1 (hijo) dice: “Papá, lo logré.”')
    expect(p).toContain('P2 (padre) dice: “Estoy orgulloso.”')
  })

  it('con varios NO manda el bloque global de voz: cada uno lleva la suya', () => {
    const l = groupIntoLotes([conT(1, 4, 't1', 'a'), conT(2, 4, 't2', 'b')])[0]
    const quien = new Map([['t1', [hijo]], ['t2', [padre]]])
    const p = buildLotePrompt({ lote: l, ...ARGS, personajes: [hijo, padre], quien })
    // Un perfil global contradiría los dos de arriba: el modelo no sabría cuál usar.
    expect(p).not.toContain('PERFIL DE VOZ Y ACENTO:')
    expect(p).toMatch(/no le des a una la voz de otra/)
  })

  it('una toma con DOS hablantes no se atribuye a uno solo', () => {
    const l = groupIntoLotes([conT(1, 4, 't1', 'Tome. No se preocupe.')])[0]
    const quien = new Map([['t1', [hijo, padre]]])
    const p = buildLotePrompt({ lote: l, ...ARGS, personajes: [hijo, padre], quien })
    expect(p).toContain('Locución: “Tome. No se preocupe.”')
    expect(p).not.toContain('P1 (hijo) dice:')
  })
})
