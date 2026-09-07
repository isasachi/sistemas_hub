import { describe, it, expect } from 'vitest'
import { groupIntoLotes, LOTE_MAX_SEC, LoteSchema, buildLotePrompt, camaraDeLote, sinEscenaDeFoto } from './lotes'
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
      conTiempo(1, 6, '00:00 - 00:06'), conTiempo(2, 6, '00:06 - 00:12'), conTiempo(3, 8, '00:12 - 00:20'),
    ])
    expect(camaraDeLote(l1, CORTES, 'fallback')).toBe('Primer plano, altura de ojos · Plano medio, cámara fija')
    expect(camaraDeLote(l2, CORTES, 'fallback')).toBe('Plano detalle del producto')
  })

  it('no repite el mismo plano cuando varios cortes lo comparten', () => {
    const cortes = [{ tiempo: 'a', camara: 'Primer plano' }, { tiempo: 'b', camara: 'Primer plano' }]
    const [l] = groupIntoLotes([conTiempo(1, 5, 'a'), conTiempo(2, 5, 'b')])
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

const VOZ = {
  idioma: 'Español', varianteRegional: 'Perú - Lima', acento: 'Español peruano de Lima',
  pronunciacion: 'Clara', ritmo: 'Conversacional', velocidad: 'Media',
  entonacion: 'Natural y cercana', energia: 'Media', pausas: 'Naturales',
  tono: 'Medio-agudo', timbre: 'Claro', edadVocal: '25-35 años', estilo: 'Amiga',
}
const ARGS = {
  camara: 'Primer plano, altura de ojos, cámara en mano',
  voz: VOZ,
  images: [
    { url: 'https://x/avatar.png', role: 'la persona' },
    { url: 'https://x/product.png', role: 'el producto' },
  ],
}

describe('buildLotePrompt', () => {
  const lote = groupIntoLotes([toma(1, 5, 'Hola, te cuento algo.'), toma(2, 5, 'Este suero me cambió la piel.')])[0]
  const p = buildLotePrompt({ lote, ...ARGS })

  it('cita las imágenes como ImageN, en el orden del array', () => {
    expect(p).toContain('Image1 = la persona')
    expect(p).toContain('Image2 = el producto')
  })

  // El reparto: las imágenes son las anclas visuales y el prompt es motion control.
  // Redescribir con palabras lo que la imagen ya muestra solo puede contradecirla, y
  // cuando se contradicen el resultado deja de ser estable.
  it('NO redescribe con texto lo que las imágenes ya muestran', () => {
    expect(p).not.toMatch(/ESCENARIO/i)
    expect(p).not.toMatch(/PERSONAJE \(descripción/i)
    expect(p).not.toMatch(/PRODUCTO \(debe verse/i)
    expect(p).toMatch(/no las redescribas/i)
  })

  it('nunca usa referencias a lotes anteriores', () => {
    for (const prohibido of ['el mismo personaje', 'el producto anterior', 'la misma habitación', 'igual que en el Lote', 'mantener lo anterior']) {
      expect(p.toLowerCase()).not.toContain(prohibido.toLowerCase())
    }
  })

  it('lleva la locución exacta de sus tomas, atada a su toma', () => {
    expect(p).toContain('Hola, te cuento algo.')
    expect(p).toContain('Este suero me cambió la piel.')
    expect(p).toMatch(/Toma 1 \(5 s\)/)
    expect(p).toMatch(/Dice, literal: “Hola/)
  })

  it('una toma muda se declara muda en vez de dejar el hueco', () => {
    const mudo = groupIntoLotes([{ ...toma(1, 4, ''), locucion: '' }])[0]
    expect(buildLotePrompt({ lote: mudo, ...ARGS })).toContain('No habla en esta toma')
  })

  it('ancla la voz y el acento', () => {
    expect(p).toContain('Español peruano de Lima')
    expect(p).toContain('25-35 años')
    expect(p).toMatch(/no resumas, no extiendas/i)
  })

  it('prohíbe todo overlay', () => {
    expect(p).toMatch(/Sin texto en pantalla/i)
    expect(p).toMatch(/watermark/i)
    expect(p).toMatch(/subt[ií]tulos/i)
  })

  it('la cámara que recibe es la que sale en el prompt, no una fija del video', () => {
    expect(buildLotePrompt({ lote, ...ARGS, camara: 'Plano medio, cámara fija en trípode' }))
      .toContain('CÁMARA: Plano medio, cámara fija en trípode.')
  })

  // Este es el test que sostiene haber BORRADO la escalera de degradación. El caso
  // pesado de verdad —8 tomas con la coreografía detallada que pide la FASE 1, ~400
  // caracteres cada una— ya no se resuelve recortando texto sino cerrando el lote
  // antes: TODOS los prompts entran y NADA se trunca. Con la emisión anterior (bloque
  // de consistencia + producto + escenario) esto era imposible sin degradar.
  it('con coreografía pesada, el reparto la reparte y ningún prompt se trunca', () => {
    const accionLarga = 'La modelo empieza de pie frente al espejo del baño con las manos a los costados, gira lentamente el torso hacia la cámara, levanta la mano derecha y toma el frasco del producto desde la repisa con dos dedos, lo sostiene a la altura del pecho, lo inclina levemente para mostrar la etiqueta, mira directo a cámara con expresión cálida y sonríe, termina con el frasco cerca del rostro y la mirada fija en el lente. '
    const muchas = groupIntoLotes(Array.from({ length: 8 }, (_, i) =>
      ({ ...toma(i + 1, 1.8, `Frase número ${i + 1} del guión adaptado, bastante larga también, para sumar presión de caracteres.`), accionVisual: accionLarga })))

    expect(muchas.length).toBeGreaterThan(1) // el presupuesto de coreografía lo partió
    const prompts = muchas.map((l) => buildLotePrompt({ lote: l, ...ARGS }))
    for (const p of prompts) {
      expect(p.length).toBeLessThan(KIE_PROMPT_MAX)
      expect(p).not.toContain('…')
    }
    // Y no se perdió ninguna toma en el camino: las 8 locuciones siguen ahí.
    const todo = prompts.join('\n')
    for (let i = 1; i <= 8; i++) expect(todo).toContain(`Frase número ${i}`)
  })

  // El caso de 15 s hablado normal, que es el 99 % del uso: un solo lote, sin partir.
  it('un lote hablado normal no roza ninguno de los dos topes', () => {
    const normal = groupIntoLotes(Array.from({ length: 3 }, (_, i) =>
      ({ ...toma(i + 1, 5, `Frase ${i + 1} del guión.`), accionVisual: 'Sostiene el frasco a la altura del pecho con la mano derecha, lo gira para mostrar la etiqueta y mira a cámara.' })))
    expect(normal).toHaveLength(1)
    expect(buildLotePrompt({ lote: normal[0], ...ARGS }).length).toBeLessThan(KIE_PROMPT_MAX / 2)
  })

  it('si aun así no entra, lanza un error explicando el exceso en vez de gastar la cuota', () => {
    const imposible = groupIntoLotes([{ ...toma(1, 5, 'Hola.'), accionVisual: 'x'.repeat(KIE_PROMPT_MAX * 2) }])[0]
    expect(() => buildLotePrompt({ lote: imposible, ...ARGS })).toThrow(new RegExp(String(KIE_PROMPT_MAX)))
  })
})


describe('sinEscenaDeFoto', () => {
  // El caso REAL: las 6 tomas de la sesión c3dc2777 terminaban así, y esa frase la puso
  // el system prompt de anuncios estáticos, no ningún insumo de la sesión.
  it('quita la escenografía de foto pegada al final de la coreografía', () => {
    expect(sinEscenaDeFoto('Sujeto sostiene el frasco y aplica. El producto no está flotando.'))
      .toBe('Sujeto sostiene el frasco y aplica.')
    expect(sinEscenaDeFoto('Muestra el frasco; no está apoyado en ninguna superficie. Mira a cámara.'))
      .toBe('Muestra el frasco. Mira a cámara.')
  })

  // El modo de fallo correcto es dejar pasar una frase de escenografía, nunca comerse
  // coreografía: una acción que se queda en nada devuelve el original.
  it('no toca la coreografía legítima y nunca vacía la acción', () => {
    const real = 'Sujeto deja el frasco sobre la mesa, aplica con el cuentagotas y mira a cámara.'
    expect(sinEscenaDeFoto(real)).toBe(real)
    expect(sinEscenaDeFoto('La modelo no está mostrando el producto todavía.'))
      .toBe('La modelo no está mostrando el producto todavía.')
    expect(sinEscenaDeFoto('El producto no está flotando.')).toBe('El producto no está flotando.')
  })

  it('el prompt del lote no emite la frase ni la duración cruda', () => {
    const lote = groupIntoLotes([
      { ...toma(1, 3.301290322580645), accionVisual: 'Aplica una gota. El producto no está flotando.' },
      toma(2, 4),
    ])[0]
    const p = buildLotePrompt({
      lote, camara: 'Plano medio', images: [{ url: 'u', role: 'the person' }],
      voz: VOZ,
    })
    expect(p).not.toContain('flotando')
    expect(p).not.toContain('3.301290322580645')
    expect(p).toContain('3.3 s')
  })
})
