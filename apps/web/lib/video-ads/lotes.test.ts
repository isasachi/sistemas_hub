import { describe, it, expect } from 'vitest'
import { groupIntoLotes, LOTE_MAX_SEC, LOTE_MAX_CHARS, LoteSchema, buildLotePrompt, camaraDeLote, repartirAccion, partirEnHechos, CAMARA_SIN_DATO, type Lote } from './lotes'
import { clampDuration } from './kie'
import type { TomaFinal } from './adapt'
import { TIMELINE_VACIO } from './motion'
import { KIE_PROMPT_MAX } from './kie'

/**
 * El tope de GROK, escrito a mano. La escalera de degradación existe por él: con Wan
 * (`KIE_PROMPT_MAX` = 20.000) ningún lote real se le acerca y la escalera queda INERTE, así
 * que sus tests pasarían por vacío — verdes sin haber ejercitado nada. Se le pasa el tope
 * viejo por parámetro para que sigan midiendo la máquina que sostiene a grok, y que volver
 * a grok (una línea, `MOTOR` en kie.ts) siga estando cubierto.
 */
const TOPE_GROK = 4096

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
  camara: 'Primer plano, altura de ojos, cámara en mano',
  voz: VOZ,
  images: [
    { url: 'https://x/character.png', role: 'la persona' },
    { url: 'https://x/product.png', role: 'el producto' },
  ],
}

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

  // ⚠️ REGRESIÓN DE LA MEJORA DE FASE 1, con datos reales de la sesión `ca62aaed`.
  // Desde que el forense describe los cortes largos POR TRAMOS con marca de tiempo, el
  // separador dejó de ser ` Luego, ` (que lo escribe `mergeMicroCortes` al fusionar) y pasó
  // a ser `; ` delante del siguiente tramo. `repartirAccion` no lo conocía, así que veía UN
  // solo tramo y mandaba los 20 s de coreografía al primer fragmento: medido, los otros dos
  // fragmentos (8,3 s de video) salieron a renderizar con la acción VACÍA.
  const tramos = '0-5 s: aplica con la mano derecha una gota en el rostro; 5-10 s: distribuye el suero con movimientos circulares en pómulos y cuello; 10-15 s: habla mirando a cámara mientras sostiene el frasco con la mano izquierda; 15-20 s: finaliza tocando su barbilla y rostro, mostrando luminosidad.'

  it('reconoce los tramos con marca de tiempo como separador', () => {
    const out = repartirAccion(tramos, [11.6, 6, 2.3])
    for (const x of out) expect(x).not.toBe('')
    expect(out[0]).toContain('aplica con la mano derecha una gota en el rostro')
    expect(out.at(-1)).toContain('finaliza tocando su barbilla')
  })

  // ⚠️ LAS MARCAS SE CAEN AL PARTIR, y no es cosmética. Son relativas a la toma ENTERA,
  // mientras que la duración de cada fragmento sale del reparto proporcional del texto
  // hablado: un fragmento de 6 s que recibe "10-15 s: …" le está pidiendo al modelo que no
  // haga nada durante los primeros diez segundos de un clip que dura seis. Ninguna
  // re-numeración las vuelve ciertas, y dos instrucciones que se contradicen dentro del
  // mismo prompt es el modo de fallo que este repo ya registró cuatro veces. Mientras la
  // toma NO se parte, las marcas se conservan: ahí sí son ciertas.
  it('al partir quita las marcas de tiempo, que ya no corresponden', () => {
    const out = repartirAccion(tramos, [11.6, 6, 2.3])
    for (const x of out) expect(x).not.toMatch(/\d+\s*-\s*\d+\s*s\s*:/)
    expect(repartirAccion(tramos, [20])).toEqual([tramos])
  })

  // Un corte FUSIONADO cuyos tramos además vienen numerados: existe en la base (1 de 215).
  // Los dos separadores tienen que convivir, no pelearse.
  it('convive con los dos separadores a la vez', () => {
    const mixto = `0-3 s: sujeta el frasco; 3-7 s: lo acerca a la mejilla Luego, gira el frasco para mostrar la etiqueta`
    const out = repartirAccion(mixto, [5, 5, 5])
    expect(out.filter(Boolean)).toHaveLength(3)
    expect(out[2]).toContain('gira el frasco')
  })
})

describe('camaraDeLote — sin emparejamiento no inventa un encuadre', () => {
  const lote = {
    n: 1, duracionSeg: 5,
    tomas: [{ n: 1, duracionSeg: 5, accionVisual: 'x', personaje: '', producto: '', locucion: '', tiempoOriginal: '00:99 - 01:00' }],
  } as unknown as Lote
  const cortes = [
    { tiempo: '00:00 - 00:05', camara: 'Plano medio, corta a la cintura' },
    { tiempo: '00:05 - 00:10', camara: 'Primer plano del producto' },
  ]

  it('no devuelve el plano de ningún corte cuando ninguno empareja', () => {
    const c = camaraDeLote(lote, cortes)
    expect(c).toBe(CAMARA_SIN_DATO)
    for (const x of cortes) expect(c).not.toContain(x.camara)
  })

  it('el default no declara ninguna escala de encuadre', () => {
    expect(CAMARA_SIN_DATO).not.toMatch(/plano|primer|medio|general|cuerpo entero|corta a/i)
  })

  it('cuando SÍ empareja usa los planos de sus cortes, no el default', () => {
    const ok = { ...lote, tomas: [{ ...lote.tomas[0], tiempoOriginal: '00:05 - 00:10' }] } as unknown as Lote
    expect(camaraDeLote(ok, cortes)).toBe('Primer plano del producto')
  })
})

// ── EL CANDADO DE MOVIMIENTO (§18.8.1)
// Es la respuesta al defecto que motiva V2: con la coreografía en prosa, grok colapsa
// varios estados en un gesto genérico y se queda quieto el resto del clip. Lo que este
// bloque agrega sobre la prosa es la VENTANA DE TIEMPO de cada tramo.
// ── LA EMISIÓN DEL PROMPT MAESTRO
//
// Estos tests fijan la FORMA del prompt que llega a grok, que volvió a ser la del spec
// (`PROMPT_MAESTRO_VIDEO_UGC_ACTUALIZADO.md`, OUTPUT — PARTE 3) tras medir que la plantilla
// en telegrama que este repo fue engordando no se ejecuta.
describe('buildLotePrompt', () => {
  const lote = groupIntoLotes([toma(1, 4, 'Hola, te cuento algo.'), toma(2, 4, 'Este suero me cambió la piel.')])[0]
  const p = buildLotePrompt({ lote, ...ARGS })

  it('emite los bloques que el spec exige, con sus rótulos', () => {
    for (const bloque of [
      'Visual Generation Prompt (absolute context):',
      'Character — the person from <IMAGE_1>:', 'Camera:', 'Continuity:', 'Voice and accent profile:',
      'Clean video rule:', 'Visual Action Sequence:', 'Final spoken script:',
    ]) expect(p).toContain(bloque)
  })

  // REGLA DE CONTEXTO ABSOLUTO: el generador no recuerda el lote anterior. Una referencia a
  // algo previo hace que devuelva otra persona — es el fallo que este diseño entero evita.
  it('nunca usa referencias a lotes anteriores', () => {
    for (const prohibido of ['el mismo personaje', 'el producto anterior', 'la misma habitación', 'igual que en el Lote', 'mantener lo anterior']) {
      expect(p.toLowerCase()).not.toContain(prohibido.toLowerCase())
    }
  })

  it('repite íntegros el bloque de consistencia y la descripción del producto', () => {
    expect(p).toContain(BLOQUE)
    expect(p).toContain(ARGS.productDesc)
  })

  // La secuencia va NUMERADA por toma, que es la forma que sí se ejecuta.
  it('numera las acciones de cada toma y cierra cada una con Texto / Overlay', () => {
    expect(p).toContain('Shot 1 — 4 seconds')
    expect(p).toContain('1. accion 1')
    expect(p).toContain('Shot 2 — 4 seconds')
    expect(p.split('Text / Overlay: NONE.').length - 1).toBe(2)
  })

  // Es la sincronización audio↔imagen: qué frase va con qué acción. Perderla en un lote y
  // no en otro produjo "una habla muy rápido y la otra muy lento".
  it('cada toma lleva su línea hablada, y el lote su guion final', () => {
    expect(p).toContain('“Hola, te cuento algo.”')
    expect(p).toContain('Final spoken script:\n“Hola, te cuento algo. Este suero me cambió la piel.”')
  })

  it('una toma muda se DECLARA muda', () => {
    const mudo = groupIntoLotes([toma(1, 4, '')])[0]
    expect(buildLotePrompt({ lote: mudo, ...ARGS })).toContain('No dialogue')
  })

  it('no imprime la duración con la basura del float', () => {
    const raro = groupIntoLotes([{ ...toma(1, 0.8854477611940298), locucion: 'x' }])[0]
    expect(buildLotePrompt({ lote: raro, ...ARGS })).toContain('Shot 1 — 0.9 seconds')
  })

  it('la cámara que recibe es la que sale en el prompt', () => {
    expect(p).toContain(ARGS.camara)
  })
})

// El escenario VUELVE al prompt porque el spec lo exige por lote (REGLA DE CONTEXTO
// ABSOLUTO). ⚠️ Contradice una medición de 4 renders —el bloque de escenario en texto hacía
// derivar el fondo contra la imagen del avatar— y es la decisión del dueño del repo al
// volver a la fuente. Por eso es el PRIMER escalón que se suelta bajo presión.
describe('buildLotePrompt — el escenario', () => {
  const lote = groupIntoLotes([toma(1, 5, 'hola')])[0]
  it('se emite cuando la sesión lo trae', () => {
    const p = buildLotePrompt({ lote, ...ARGS, escenario: 'habitación con estantería de madera' })
    expect(p).toContain('Setting and lighting: habitación con estantería de madera')
  })
  it('sin escenario no deja el rótulo colgando', () => {
    expect(buildLotePrompt({ lote, ...ARGS })).not.toContain('Setting and lighting')
  })
})

describe('buildLotePrompt — las acciones numeradas', () => {
  const beat = (i: number, importance: 'major' | 'micro') => ({
    startSec: i, endSec: i + 1, referenceFrameMs: 0,
    action: `The avatar raises the dropper ${i} with her right hand while her left hand holds the bottle`,
    productStateBefore: 'en la mano', productStateAfter: 'en la mano', importance,
  })

  // El timeline de V2 se REUSA como fuente de la secuencia: sus campos son, uno a uno, lo
  // que pide la REGLA DE ACCIONES del spec. Lo único que se descarta son sus ventanas.
  // ⚠️ UNA ORACIÓN DESCRIPTIVA POR EVENTO, no `Mano derecha: …` — pedido del dueño del repo
  // con su ejemplo ("The avatar gently raises the dropper in her left hand and releases a
  // drop of serum on her left cheek while holding the bottle with her right hand"). Se llegó
  // por descarte: un ítem con cuatro hechos se ejecuta como un gesto solo, y una línea por
  // casilla da 5×N ítems que el presupuesto recorta a trece caracteres.
  it('escribe una oración por evento, con las dos manos tejidas', () => {
    const beats = [beat(0, 'major'), beat(1, 'micro'), beat(2, 'major')]
    const t = { ...toma(1, 6, 'hola'), beats }
    const lote = groupIntoLotes([t], new Map([[t.tiempoOriginal, { ...TIMELINE_VACIO, beats }]]))[0]
    const p = buildLotePrompt({ lote, ...ARGS })
    expect(p).toContain('1. The avatar raises the dropper 0 with her right hand while her left hand holds the bottle')
    // El beat `micro` se absorbe; la postura y la mirada no se repiten si no cambian.
    expect(p).toContain('2. The avatar raises the dropper 2 with her right hand while her left hand holds the bottle')
    expect(p).not.toContain('dropper 1')
    expect(p).not.toContain('3. ')
  })

  // ⚠️ SIN MARCAS DE TIEMPO. El prompt que sí se ejecuta pide acciones distintas, no un
  // muestreo del segundo a segundo; las ventanas eran lo que volvía indistinguibles a cinco
  // rebanadas de la misma acción.
  it('no lleva ventanas de tiempo por acción', () => {
    const beats = [beat(0, 'major'), beat(2, 'major')]
    const t = { ...toma(1, 6, 'hola'), beats }
    const lote = groupIntoLotes([t], new Map([[t.tiempoOriginal, { ...TIMELINE_VACIO, beats }]]))[0]
    expect(buildLotePrompt({ lote, ...ARGS })).not.toMatch(/\[\d+\.\d–\d+\.\d s?\]/)
  })

  // Sin timeline —toda sesión guardada— se parte la prosa por sus separadores.
  it('sin timeline salen de partir accionVisual', () => {
    const t = { ...toma(1, 6, 'hola'), accionVisual: 'sostiene el frasco Luego, se aplica una gota' }
    const p = buildLotePrompt({ lote: groupIntoLotes([t])[0], ...ARGS })
    expect(p).toContain('1. sostiene el frasco')
    expect(p).toContain('2. se aplica una gota')
  })
})

// ⚠️ LOS TRES TESTS DE ABAJO FIJAN DECISIONES DE ORDEN, que es justo lo que un refactor
// deshace sin que nada se entere: el contenido del prompt no cambia, así que ningún test de
// "contiene el bloque X" los ve caer.
describe('buildLotePrompt — la coreografía va ARRIBA', () => {
  const lote = groupIntoLotes([toma(1, 4, 'Hola.')])[0]
  const p = buildLotePrompt({ lote, ...ARGS, escenario: 'una cocina blanca' })

  // La guía de este modelo: "la acción escrita al PRINCIPIO del prompt aparece al principio
  // del clip". Estaba en el bloque 12 de 13, detrás de ~3.000 caracteres de contexto.
  it('la secuencia de acciones precede al bloque de personaje y al de producto', () => {
    const acciones = p.indexOf('Visual Action Sequence:')
    expect(acciones).toBeGreaterThan(-1)
    expect(acciones).toBeLessThan(p.indexOf('Character — the person from <IMAGE_1>:'))
    expect(acciones).toBeLessThan(p.indexOf('Camera:'))
  })

  // ⚠️ EL BLOQUE DE VIDEO LIMPIO YA SE COMPRIMIÓ UNA VEZ (313 → 183, medido con 4 renders).
  // Estas dos frases son lo que queda y NO son relleno: la primera impide objetos inventados,
  // la segunda impide que el modelo BORRE la etiqueta del frasco al obedecer la prohibición
  // de texto. Un recorte futuro que se las lleve se ve acá.
  it('la regla de video limpio conserva las dos frases que no son sinónimos', () => {
    expect(p).toContain('Only the character, the product and the real room')
    expect(p).toContain('Text printed on the product itself stays')
    // Y no vuelve a la letanía de quince sinónimos.
    expect(p).not.toContain('No stickers.')
  })

  // ⚠️ MEDIDO CON 4 RENDERS (`scripts/probe-cita-imagen.ts`, 2 draws por brazo): con la
  // leyenda `@image(n)` arriba y sin volver a nombrarla, la etiqueta del producto sale
  // legible en 1 de 2 y el gotero no se separa del frasco en ninguno; citando `<IMAGE_n>`
  // DENTRO de la cláusula —la forma del ejemplo oficial de xAI— la etiqueta sale legible en
  // 2 de 2 y la apertura con el gotero se ejecuta en 2 de 2.
  it('cita <IMAGE_n> dentro de la cláusula y no deja ningún @image(n) suelto', () => {
    expect(p).toMatch(/References: <IMAGE_1> = .+ · <IMAGE_2> = /)
    expect(p).toContain('Character — the person from <IMAGE_1>:')
    expect(p).toMatch(/the product from <IMAGE_2>:/)
    expect(p).not.toMatch(/@image\(/)
  })

  // La locución final sigue cerrando el prompt: es el contrato de idioma y el test de arriba
  // ya fija que va pegada a su rótulo.
  it('el guion hablado sigue siendo lo último', () => {
    expect(p.indexOf('Final spoken script:')).toBeGreaterThan(p.indexOf('Visual Action Sequence:'))
  })
})

describe('buildLotePrompt — el orden de la escalera', () => {
  // Un lote que NO entra ni degradando, para recorrer la escalera entera hasta el piso.
  const apretado = (extra: number) => buildLotePrompt({
    lote: groupIntoLotes([1, 2, 3].map((n) => ({
      ...toma(n, 5, 'Una frase que ocupa lo suyo dentro del lote.'),
      tiempoOriginal: `00:0${n} - 00:0${n + 5}`,
      accionVisual: 'acción detallada de la mano y del cuerpo. '.repeat(10),
    })))[0],
    ...ARGS,
    escenario: 'una habitación con muchísimo detalle. '.repeat(extra),
    productDesc: 'Frasco de vidrio. Etiqueta impresa. Texto en negro. '.repeat(extra),
    movimiento: { calidadMovimiento: 'MOVIMIENTO-FLUIDO-MARCADOR', manerismos: 'se toca el pelo' },
    promptMax: TOPE_GROK,
  })

  // ⚠️ ÉSTE ES EL TEST QUE FIJA LA INVERSIÓN, y hay que escribirlo así para que discrimine:
  // "sin movimiento ⟹ sin escenario" se cumplía TAMBIÉN con el orden viejo (el escenario ya
  // era el primer escalón), así que no mide nada. Lo que solo es cierto con el orden nuevo es
  // que en el escalón donde la ETIQUETA ya se recortó, el movimiento siga estando.
  it('cuando la etiqueta del producto ya se recortó, el bloque de movimiento TODAVÍA está', () => {
    let encontrado = false
    for (let extra = 1; extra <= 40; extra++) {
      const p = apretado(extra)
      if (p.includes('El resto de la etiqueta se lee de su imagen.')) {
        encontrado = true
        expect(p).toContain('MOVIMIENTO-FLUIDO-MARCADOR')
        break
      }
    }
    // Si nunca se recorta la etiqueta, el barrido no probó nada y hay que recalibrarlo.
    expect(encontrado).toBe(true)
  })

  it('con presión moderada no se suelta nada del movimiento', () => {
    expect(apretado(1)).toContain('MOVIMIENTO-FLUIDO-MARCADOR')
  })
})

describe('buildLotePrompt — el encuadre entra en la escalera', () => {
  // Medido sobre 146 lotes reales: `camaraDeLote` llega a 411 caracteres y era el único
  // bloque grande que no estaba en ningún escalón.
  const CAMARA_LARGA = 'Primer plano a la altura de los ojos, cortando a la altura del pecho. '
    + 'La luz entra por la izquierda y deja el fondo desenfocado con una caída suave. '.repeat(4)

  it('con holgura se emite entero', () => {
    const p = buildLotePrompt({ lote: groupIntoLotes([toma(1, 4, 'Hola.')])[0], ...ARGS, camara: CAMARA_LARGA })
    expect(p).toContain(CAMARA_LARGA.trim())
  })

  it('bajo presión se recorta a su primera oración en vez de pagarlo entero', () => {
    const p = buildLotePrompt({
      lote: groupIntoLotes([1, 2, 3].map((n) => ({
        ...toma(n, 5, 'Una frase que ocupa lo suyo dentro del lote.'),
        tiempoOriginal: `00:0${n} - 00:0${n + 5}`,
        accionVisual: 'acción detallada de la mano y del cuerpo. '.repeat(10),
      })))[0],
      ...ARGS,
      camara: CAMARA_LARGA,
      escenario: 'una habitación con muchísimo detalle. '.repeat(20),
      productDesc: 'Frasco de vidrio. Etiqueta impresa. '.repeat(20),
      promptMax: TOPE_GROK,
    })
    expect(p).toContain('Camera: Primer plano a la altura de los ojos, cortando a la altura del pecho.')
    expect(p).not.toContain('La luz entra por la izquierda')
    expect(p.length).toBeLessThanOrEqual(TOPE_GROK)
  })
})

describe('buildLotePrompt — el presupuesto', () => {
  it('un lote cargado entra en el tope de ESTE modelo', () => {
    const largo = groupIntoLotes([1, 2, 3].map((n) => ({
      ...toma(n, 5, 'Una frase larga que ocupa lo suyo dentro del lote.'),
      tiempoOriginal: `00:0${n} - 00:0${n + 5}`,
      accionVisual: `${'acción muy detallada de la mano y del cuerpo '.repeat(12)}`,
    })))[0]
    const p = buildLotePrompt({
      lote: largo, ...ARGS,
      escenario: 'una habitación descrita con muchísimo detalle. '.repeat(20),
      productDesc: 'Frasco de vidrio. Etiqueta impresa. '.repeat(30),
    })
    expect(p.length).toBeLessThanOrEqual(KIE_PROMPT_MAX)
  })
})

// ⚠️ El caso REAL que lo destapó, del forense de `7e4ccbcf`: cuatro hechos encadenados con
// comas y punto y coma dentro de un solo ítem numerado.
describe('partirEnHechos', () => {
  it('parte por punto, punto y coma y conectores de secuencia', () => {
    expect(partirEnHechos(
      'Sostiene gotero con mano derecha, lo levanta y muestra la gota; mano izquierda sostiene el frasco. Mirada a cámara.',
    )).toEqual([
      'Sostiene gotero con mano derecha, lo levanta y muestra la gota',
      'mano izquierda sostiene el frasco',
      'Mirada a cámara',
    ])
  })

  it('parte por "luego", que es como el forense encadena', () => {
    expect(partirEnHechos('Muestra el frasco a cámara con ambas manos, luego aplica gota en mejilla izquierda'))
      .toEqual(['Muestra el frasco a cámara con ambas manos', 'aplica gota en mejilla izquierda'])
  })

  // ⚠️ NO se parte por coma a secas: "gotero con mano derecha" y "mejilla izquierda" llevan
  // comas que no separan hechos, y partir ahí deja fragmentos sin verbo — peor que un ítem
  // largo.
  it('no parte por coma a secas', () => {
    expect(partirEnHechos('aplica una gota en la mejilla, el pómulo y el cuello')).toHaveLength(1)
  })

  it('conserva el separador de fusión de mergeMicroCortes', () => {
    expect(partirEnHechos('gira a perfil Luego, vuelve de frente')).toEqual(['gira a perfil', 'vuelve de frente'])
  })
})
