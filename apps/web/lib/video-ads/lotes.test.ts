import { describe, it, expect } from 'vitest'
import { groupIntoLotes, LOTE_MAX_SEC, LOTE_MAX_CHARS, LoteSchema, expandirHechos, defectosDelForense, buildLotePrompt, camaraDeLote, sinEscenaDeFoto, partirEnTramos, repartirAccion } from './lotes'
import type { TomaFinal } from './adapt'
import type { Hecho } from './forensic'
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
  producto: '',
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
    expect(p).toMatch(/reprodúcelos idénticos/i)
  })

  // La excepción a la regla de arriba, y por qué existe: la imagen sostiene la etiqueta
  // pero no el COLOR ni las piezas del envase — los renders salían con el frasco de otro
  // color, sin tapa y con un segundo cuentagotas. La descripción se cita en la MISMA
  // cláusula que la imagen para que no compitan.
  it('el producto va con su color y sus piezas, citando la imagen en la misma cláusula', () => {
    const conProd = buildLotePrompt({
      lote, ...ARGS,
      producto: 'Botella de vidrio púrpura con tapón cuentagotas blanco.',
    })
    expect(conProd).toContain('PRODUCTO — el de Image2')
    expect(conProd).toContain('tapón cuentagotas blanco')
    // La invariante de piezas y manos: NO es coreografía (no dice qué gesto hacer), es
    // lo que impide el tercer brazo y el gotero duplicado. No depende del producto.
    expect(p).toMatch(/Dos manos y nada más/)
    expect(p).toMatch(/no hay una segunda copia/)
  })

  it('emite UN HECHO POR LÍNEA, no un renglón con todos', () => {
    const dos = groupIntoLotes([{ ...toma(1, 6, 'Hola.'),
      accionVisual: 'Sostiene el frasco con la derecha; destapa con la izquierda; aplica una gota en la mejilla' }])[0]
    const salida = buildLotePrompt({ lote: dos, ...ARGS })
    expect(salida).toContain('  - Sostiene el frasco con la derecha.')
    expect(salida).toContain('  - Destapa con la izquierda.')
    expect(salida).toContain('  - Aplica una gota en la mejilla.')
  })

  // Con VARIAS tomas la lista abre igual con su rótulo: es el caso con más hechos que
  // ordenar, y sin él la lista de tomas queda pegada a la regla de piezas.
  it('anuncia la coreografía con MOVIMIENTO aunque el lote tenga varias tomas', () => {
    expect(p).toMatch(/^MOVIMIENTO:$/m)
    expect(p).toMatch(/MOVIMIENTO:\nToma 1 /)
  })

  // Los escalones, en orden: primero lo que la imagen ya muestra, después el FORMATO
  // (los mismos hechos en línea corrida), y la coreografía nunca. Sin ellos, un lote
  // pesado dejaba de poder renderizarse por completo.
  // El escalón que hoy NO se dispara en ningún lote real, y NO es una red de seguridad
  // general: el formato ahorra ~4 caracteres por hecho, o sea rescata una banda de unos
  // 130 caracteres y nada más. Existe porque el lote más pesado de la base pasa a 15 del
  // tope, y sin él ese lote se queda sin prompt. Los hechos vuelven al renglón corrido:
  // se ejecutan peor, están todos.
  it('y si aun así no entra, vuelve a la línea corrida sin perder un solo hecho', () => {
    const hecho = (i: number) => `sostiene el envase numero ${i} con la mano derecha mientras observa la etiqueta con atencion`
    const pesada = groupIntoLotes([{ ...toma(1, 14, 'Frase corta.'),
      accionVisual: Array.from({ length: 33 }, (_, i) => hecho(i)).join('; ') }])[0]
    const salida = buildLotePrompt({ lote: pesada, ...ARGS })
    expect(salida).not.toMatch(/^ {2}- /m)          // se soltó el formato
    expect(salida).toContain('envase numero 32')     // pero no el contenido
    expect(salida.length).toBeLessThanOrEqual(KIE_PROMPT_MAX)
  })

  it('si el prompt no entra, suelta el bloque de producto antes que la coreografía', () => {
    const largo = 'Cristal transparente con etiqueta blanca y tapa dorada. '.repeat(200)
    const salida = buildLotePrompt({ lote, ...ARGS, producto: largo })
    expect(salida).not.toContain('PRODUCTO — el de')
    expect(salida).toMatch(/Dos manos y nada más/)
    expect(salida.length).toBeLessThanOrEqual(KIE_PROMPT_MAX)
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
      voz: VOZ, producto: '',
    })
    expect(p).not.toContain('flotando')
    expect(p).not.toContain('3.301290322580645')
    expect(p).toContain('3.3 s')
  })
})

describe('partirEnTramos', () => {
  it('parte por punto y por punto y coma', () => {
    expect(partirEnTramos('Suelta una gota; extiende con los dedos. Mira a cámara.'))
      .toEqual(['Suelta una gota', 'extiende con los dedos', 'Mira a cámara'])
  })

  it('parte por coma SOLO cuando la cláusula abre con un verbo de la lista', () => {
    // el caso real de la sesión que destapó el defecto: cuatro hechos separados por coma
    expect(partirEnTramos(
      'Sujeto se aplica producto en mejilla, extiende suavemente con dedos, realiza toques ascendentes, muestra el frasco a cámara.',
    )).toHaveLength(4)
  })

  it('NO parte una coma que no abre un hecho — el falso positivo medido', () => {
    // "a cámara" sin verbo: partirlo deja un fragmento sin acción
    expect(partirEnTramos('Mira el producto, y luego a cámara')).toEqual([
      'Mira el producto, y luego a cámara',
    ])
  })
})

describe('repartirAccion', () => {
  it('reparte los hechos en ORDEN y proporcional a la duración', () => {
    const [a, b] = repartirAccion('uno; dos; tres; cuatro', [3, 1])
    expect(a).toBe('uno. dos. tres.')
    expect(b).toBe('cuatro.')
  })

  it('da al menos un hecho a cada fragmento cuando alcanza', () => {
    // 9:1 — el reparto puramente proporcional dejaría el segundo vacío teniendo material
    expect(repartirAccion('uno; dos', [9, 1])).toEqual(['uno.', 'dos.'])
  })

  it('sin separador, TODO va al primero y el resto queda vacío (nunca duplicado)', () => {
    expect(repartirAccion('un solo hecho sin cortes', [5, 5])).toEqual([
      'un solo hecho sin cortes', '',
    ])
  })
})

describe('la toma partida NO duplica la coreografía', () => {
  it('cada fragmento recibe su tramo, no la acción entera', () => {
    const larga: TomaFinal = {
      ...toma(1, 19.3, 'Primera frase. Segunda frase. Tercera frase. Cuarta frase.'),
      accionVisual: 'Aplica el producto; extiende con los dedos; muestra el frasco a cámara.',
    }
    const frags = groupIntoLotes([larga]).flatMap((l) => l.tomas)
    expect(frags.length).toBeGreaterThan(1)
    const acciones = frags.map((f) => f.accionVisual).filter(Boolean)
    expect(new Set(acciones).size).toBe(acciones.length)
    expect(acciones.join(' ')).toContain('muestra el frasco a cámara')
  })
})

describe('el reparto no deja escenografía de foto ni carriles vacíos', () => {
  it('la escenografía de foto no puede ser el único hecho de un fragmento', () => {
    // se limpia ANTES de partir: como oración entera sobrevivía al split y quedaba
    // siendo la única instrucción de movimiento de un clip
    const [a, b] = repartirAccion(
      'Aplica el producto; extiende con los dedos. El producto no está flotando.',
      [5, 5],
    )
    expect(a).toBe('Aplica el producto.')
    expect(b).toContain('extiende con los dedos')
    expect(b).not.toMatch(/flotando/)
  })

  // Lote 3 de `00471f8a` (2026-09-07): el corte de 20 s se partió en 12 + 8 y el segundo
  // fragmento recibió "extiende con las yemas; mira y señala" a secas. El clip arrancó
  // sacando el gotero, soltó una gota en la palma y las dos manos subieron a la cara
  // vacías — el frasco reapareció en el segundo 7. El original tiene el frasco en la
  // derecha todo el tramo y la gota ya aplicada.
  it('la frontera entre fragmentos es un estado cerrado: abre con las manos declaradas y cierra el envase', () => {
    const corte3 = 'Sujeta el frasco con la mano derecha; aplica una gota sobre la mejilla con el cuentagotas en la izquierda; extiende el suero con las yemas de los dedos sobre la mejilla, el mentón y el cuello con movimientos ascendentes; mira a la cámara y señala el resultado en su piel.'
    const [a, b, c] = repartirAccion(corte3, [12, 5.6, 2.4])
    // el corte nunca dijo dónde terminó el cuentagotas: el fragmento que lo sacó lo devuelve
    expect(partirEnTramos(a)).toEqual([
      'Sujeta el frasco con la mano derecha',
      'aplica una gota sobre la mejilla con el cuentagotas en la izquierda',
      'vuelve a poner el cuentagotas en el envase y lo cierra',
      'termina con el envase en la mano derecha, cerrado',
    ])
    // el siguiente arranca con el envase cerrado en la derecha, la izquierda libre y el suero ya puesto
    expect(partirEnTramos(b)).toEqual([
      'Sujeta el frasco con la mano derecha',
      'el envase está cerrado, con el cuentagotas dentro',
      'la mano izquierda está libre',
      'el producto ya está sobre la piel desde el inicio',
      'extiende el suero con las yemas de los dedos sobre la mejilla, el mentón y el cuello con movimientos ascendentes',
      'termina con el envase en la mano derecha, cerrado',
    ])
    expect(partirEnTramos(c)).toEqual([
      'Sujeta el frasco con la mano derecha',
      'el envase está cerrado, con el cuentagotas dentro',
      'la mano izquierda está libre',
      'el producto ya está sobre la piel desde el inicio',
      'mira a la cámara y señala el resultado en su piel',
    ])
  })

  it('si el corte cierra el envase más adelante, la frontera se corre hasta después del cierre', () => {
    const [a, b] = repartirAccion(
      'Sujeta el frasco con la mano derecha; destapa el frasco con la izquierda; aplica una gota en la mejilla con el cuentagotas; cierra el frasco; masajea la mejilla con la izquierda; mira a cámara',
      [5, 5],
    )
    // el reparto proporcional cortaba en 3/3, con el gotero fuera: abrir, aplicar y cerrar van juntos
    expect(a).toContain('cierra el frasco')
    expect(a).not.toMatch(/vuelve a poner/)
    expect(b).toMatch(/^Sujeta el frasco con la mano derecha\. el envase está cerrado/)
    expect(b).toContain('masajea la mejilla con la izquierda')
    // el estado que se hereda es el ÚLTIMO declarado antes del fragmento, no el primero del corte
    const [, c] = repartirAccion('Sujeta el frasco con la derecha; pasa el frasco a la izquierda; sostiene el frasco con la mano izquierda; masajea la mejilla; mira a cámara', [10, 5])
    expect(c).toMatch(/^sostiene el frasco con la mano izquierda\. la mano derecha está libre/)
    // si el propio fragmento dispensa, no se le dice que ya está aplicado
    const [, d] = repartirAccion('Sujeta el frasco con la mano derecha; aplica una gota en la mejilla; aplica otra gota en la frente; extiende', [5, 5])
    expect(d).not.toMatch(/ya está sobre la piel/)
    // sin estado declarado, sin aplicador y sin transferencia, nada se agrega
    expect(repartirAccion('uno; dos', [9, 1])).toEqual(['uno.', 'dos.'])
  })

  it('entre dos fragmentos del mismo corte en el MISMO lote no hay andamiaje de frontera', () => {
    const corte3 = 'Sujeta el frasco con la mano derecha; aplica una gota sobre la mejilla con el cuentagotas en la izquierda; extiende el suero con las yemas; mira a la cámara y señala el resultado en su piel.'
    const corteLargo = { ...toma(1, 20, 'Una frase corta. Otra frase corta. Y una tercera.'), accionVisual: corte3, tiempoOriginal: '00:15 - 00:35' }
    const lotes = groupIntoLotes([corteLargo])
    const conDos = lotes.find((l) => l.tomas.length >= 2)!
    expect(conDos.tomas.length).toBeGreaterThanOrEqual(2)
    const p = buildLotePrompt({ lote: conDos, camara: 'Plano medio.', voz: VOZ, producto: '', images: [{ url: 'a', role: 'la persona' }] })
    const bloque = p.split('MOVIMIENTO:')[1].split('\nCÁMARA')[0]
    const tomasEmitidas = bloque.split(/\nToma \d/).length - 1
    // dentro del clip no se "termina" ni se vuelve a abrir el estado entre tomas contiguas
    expect((bloque.match(/termina con el envase/gi) ?? []).length).toBeLessThanOrEqual(tomasEmitidas ? 1 : 0)
    expect((bloque.match(/está libre/gi) ?? []).length).toBeLessThanOrEqual(1)
    expect((bloque.match(/Sujeta el frasco con la mano derecha/g) ?? []).length).toBe(1)
  })

  it('un fragmento sin hecho propio DECLARA la quietud, no deja el encabezado suelto', () => {
    const larga: TomaFinal = {
      ...toma(1, 20, 'Primera frase. Segunda frase.'),
      accionVisual: 'Alterna entre sostener el producto y hablar a cámara',
    }
    // los dos fragmentos de 10 s no caben en un lote, así que el vacío cae en el segundo
    const p = groupIntoLotes([larga])
      .map((lote) => buildLotePrompt({
        lote, camara: 'Plano medio.', voz: VOZ, producto: '',
        images: [{ url: 'a', role: 'la persona' }],
      }))
      .join('\n')
    expect(p).not.toMatch(/^Toma \d+ \([\d.]+ s\): *$/m)
    expect(p).toContain('sin gesto nuevo')
  })

  it('la línea de cámara no dobla el punto', () => {
    const p = buildLotePrompt({
      lote: groupIntoLotes([toma(1, 5)])[0],
      camara: 'Plano medio corto, cámara en mano.', voz: VOZ, producto: '',
      images: [{ url: 'a', role: 'la persona' }],
    })
    expect(p).toContain('CÁMARA: Plano medio corto, cámara en mano. Grabado')
  })

  // Dos órdenes opuestas en la misma línea: el 74 % de los cortes dicen "fija/estable" y
  // la plantilla les pegaba "micro-temblor" al lado.
  it('no pide micro-temblor cuando la cámara del original es fija', () => {
    const p = buildLotePrompt({
      lote: groupIntoLotes([toma(1, 5)])[0],
      camara: 'Plano medio corto, estable.', voz: VOZ, producto: '',
      images: [{ url: 'a', role: 'la persona' }],
    })
    expect(p).toContain('CÁMARA: Plano medio corto, estable.')
    expect(p).not.toMatch(/temblor/)
  })

  // Un lote con tomas de DOS planos pedía "una sola toma continua" con las dos cámaras
  // pegadas en una línea; grok renderiza una y descarta la otra.
  it('con dos planos anuncia el plano por toma, con corte seco, y no "toma continua"', () => {
    const t1 = { ...toma(1, 5), tiempoOriginal: '00:00 - 00:05' }
    const t2 = { ...toma(2, 5), tiempoOriginal: '00:05 - 00:10' }
    const t3 = { ...toma(3, 4), tiempoOriginal: '00:10 - 00:14' }
    const cortes = [
      { tiempo: '00:00 - 00:05', camara: 'Primer plano fijo.' },
      { tiempo: '00:05 - 00:10', camara: 'Plano medio con zoom lento.' },
      { tiempo: '00:10 - 00:14', camara: 'Plano medio con zoom lento.' },
    ]
    const lote = groupIntoLotes([t1, t2, t3])[0]
    const p = buildLotePrompt({
      lote, camara: 'Primer plano fijo. · Plano medio con zoom lento.', voz: VOZ, producto: '',
      images: [{ url: 'a', role: 'la persona' }], cortes,
    })
    expect(p).not.toMatch(/toma continua/)
    expect(p).toMatch(/corte seco/)
    expect(p).toContain('Toma 1 (5 s) — Primer plano fijo:')
    expect(p).toContain('Toma 2 (5 s) — Plano medio con zoom lento:')
    // el plano vale hasta que se anuncia otro
    expect(p).toContain('Toma 3 (4 s):')
    expect(p).not.toContain('CÁMARA: Primer plano fijo. · Plano medio')
    // con un solo plano, la forma de siempre
    const uno = buildLotePrompt({
      lote: groupIntoLotes([t1, t2])[0], camara: 'Primer plano fijo.', voz: VOZ, producto: '',
      images: [{ url: 'a', role: 'la persona' }],
      cortes: [{ tiempo: '00:00 - 00:05', camara: 'Primer plano fijo.' }, { tiempo: '00:05 - 00:10', camara: 'Primer plano fijo.' }],
    })
    expect(uno).toMatch(/una sola toma continua/)
    expect(uno).toContain('Toma 1 (5 s):')
  })
})

describe('corte por tiempo, en estado cerrado (hechos con ventana)', () => {
  const h = (desde: number, hasta: number, texto: string): Hecho => ({ desde, hasta, texto })
  // el corte abre y cierra el envase DOS veces; la frontera "que entra" cae a mitad de la
  // segunda aplicación, y una frase antes hay un estado cerrado
  const hechos = [
    h(0, 2, 'sujeta el frasco con la mano derecha'),
    h(2, 4, 'aplica una gota en la mejilla con el cuentagotas'),
    h(4, 5, 'vuelve a poner el cuentagotas en el frasco y lo cierra'),
    h(5, 13, 'extiende el suero con las yemas de la izquierda'),
    h(13, 18, 'aplica otra gota en la frente con el cuentagotas'),
    h(18, 20, 'vuelve a poner el cuentagotas en el frasco y lo cierra'),
  ]
  // frases de 40 / 35 / 25 caracteres → fines en 0.4, 0.75 y 1.0 de la toma (8, 15 y 20 s)
  const locucion = `${'a'.repeat(39)}. ${'b'.repeat(34)}. ${'c'.repeat(24)}.`
  const larga: TomaFinal = { ...toma(1, 20, locucion), tiempoOriginal: '00:00 - 00:20', accionVisual: hechos.map((x) => x.texto).join('; ') }
  const cortes = [{ tiempo: '00:00 - 00:20', hechos }]

  it('prefiere la frontera más lejana que entra Y está en estado cerrado, no la más lejana a secas', () => {
    const lotes = groupIntoLotes([larga], cortes)
    // sin hechos partiría en 15 + 5 (la frontera más lejana que entra), a mitad de la
    // segunda aplicación; con ellos retrocede al fin de frase con el envase cerrado
    expect(lotes.map((l) => l.duracionSeg)).toEqual([8, 12])
    const [a, b] = lotes.map((l) => l.tomas[0])
    expect(a.locucion).toBe(`${'a'.repeat(39)}.`)
    expect(partirEnTramos(a.accionVisual)).toEqual([
      'sujeta el frasco con la mano derecha',
      'aplica una gota en la mejilla con el cuentagotas',
      'vuelve a poner el cuentagotas en el frasco y lo cierra',
      'termina con el envase en la mano derecha, cerrado',
    ])
    // el segundo recibe SOLO los hechos de su ventana, y abre con el estado
    expect(b.accionVisual).toMatch(/^sujeta el frasco con la mano derecha\. el envase está cerrado/)
    expect(b.accionVisual).toContain('aplica otra gota en la frente')
    expect(b.accionVisual).not.toContain('aplica una gota en la mejilla')
    // sin cortes, el reparto viejo: proporcional por frases, que sí parte en 15 + 5
    expect(groupIntoLotes([larga]).map((l) => l.duracionSeg)).toEqual([15, 5])
  })

  // El corte 4 real de `00471f8a`: dos hechos, el segundo de 18 s. Por punto medio el
  // fragmento 2 quedaba VACÍO ("sin gesto nuevo") mientras en el original sigue masajeando.
  it('un hecho sostenido que cruza la frontera sigue en el fragmento siguiente; un evento no', () => {
    const dos = [
      h(0, 2, 'sostiene el envase en la mano derecha y aplica producto con el gotero en la mejilla izquierda'),
      h(2, 20, 'se aplica el serum con los dedos en mejillas y mentón, sosteniendo el frasco con la mano derecha'),
    ]
    const t = { ...larga, accionVisual: dos.map((x) => x.texto).join('; ') }
    const [l1, l2] = groupIntoLotes([t], [{ tiempo: '00:00 - 00:20', hechos: dos }])
    // sin frontera cerrada posible (el gotero nunca vuelve), se corta donde entra y se cierra ahí
    expect(l1.tomas[0].accionVisual).toMatch(/vuelve a poner el gotero en el envase y lo cierra/)
    // el masaje sigue en el segundo fragmento, y la aplicación NO se repite
    expect(l2.tomas[0].accionVisual).toContain('se aplica el serum con los dedos')
    expect(l2.tomas[0].accionVisual).not.toMatch(/aplica producto con el gotero/)
    expect(l2.tomas[0].accionVisual).not.toMatch(/sin gesto nuevo/)
    expect(l2.tomas[0].accionVisual).toMatch(/el envase está cerrado/)
  })

  // Segundo sorteo real del forense sobre `00471f8a`: UN hecho por corte con varias
  // cláusulas adentro. Sin partirlo, el corte por tiempo se apagaba (1 hecho < 2).
  it('un hecho con varias cláusulas se parte repartiendo su ventana en proporción', () => {
    const [a, b, c] = expandirHechos([h(0, 3.4, 'sostiene el frasco con la mano izquierda; retira el gotero con la derecha; deja caer una gota sobre la mejilla')])
    expect(a.desde).toBe(0)
    expect(c.hasta).toBeCloseTo(3.4, 6)
    expect(a.hasta).toBeCloseTo(b.desde, 6)
    expect(b.hasta).toBeCloseTo(c.desde, 6)
    expect(a.hasta).toBeGreaterThan(0.9) // ~37 % de los caracteres
    expect(expandirHechos([h(0, 5, 'mira a cámara')])).toEqual([h(0, 5, 'mira a cámara')])
    // y con eso el corte por tiempo sí corre: mismos 8 + 12 que con la lista ya partida
    const unoSolo = [{ tiempo: '00:00 - 00:20', hechos: [h(0, 20, hechos.map((x) => x.texto).join('; '))] }]
    expect(groupIntoLotes([larga], unoSolo).map((l) => l.duracionSeg)).toEqual([15, 5])
  })

  // El corte 4 del tercer sorteo real: la frontera se corre hasta después de "guarda el
  // gotero" y se lleva el masaje; el segundo fragmento quedaba con solo el andamiaje.
  it('si al correr la frontera tras el cierre el fragmento queda vacío, continúa la última acción sostenida', () => {
    const cuatro = [
      h(0, 10, 'la mano derecha aplica una gota del gotero sobre la mejilla, la izquierda sostiene el frasco'),
      h(10, 13, 'extiende el producto con los dedos'),
      h(13, 17, 'masajea las mejillas y el cuello'),
      h(17, 20, 'guarda el gotero en el frasco'),
    ]
    const t = { ...larga, locucion: `${'a'.repeat(59)}. ${'b'.repeat(39)}.`, accionVisual: cuatro.map((x) => x.texto).join('; ') }
    const [l1, l2] = groupIntoLotes([t], [{ tiempo: '00:00 - 00:20', hechos: cuatro }])
    expect(l1.tomas[0].accionVisual).toContain('guarda el gotero en el frasco')
    expect(l2.tomas[0].accionVisual).toContain('masajea las mejillas y el cuello')
    expect(l2.tomas[0].accionVisual).not.toMatch(/gotero sobre la mejilla|guarda el gotero/)
    expect(l2.tomas[0].accionVisual).toMatch(/el envase está cerrado/)
  })

  it('si los hechos y los tramos de FASE 3 no cuentan lo mismo, cae al reparto proporcional', () => {
    const otra = { ...larga, accionVisual: 'sujeta el frasco con la mano derecha; extiende con las yemas' }
    expect(groupIntoLotes([otra], cortes).map((l) => l.duracionSeg)).toEqual([15, 5])
  })

  it('la cámara nunca se supone: sin "en mano" no hay temblor, y sin dato no hay línea', () => {
    const lote = groupIntoLotes([toma(1, 5)])[0]
    const base = { lote, voz: VOZ, producto: '', images: [{ url: 'a', role: 'la persona' }] }
    expect(buildLotePrompt({ ...base, camara: 'Plano medio, frontal.' })).not.toMatch(/temblor/)
    expect(buildLotePrompt({ ...base, camara: 'En mano, plano medio.' })).toMatch(/micro-temblor/)
    const sinDato = buildLotePrompt({ ...base, camara: '' })
    expect(sinDato).not.toMatch(/^CÁMARA:/m)
    expect(sinDato).not.toMatch(/temblor/)
  })

  it('prohíbe el relleno entre hechos, salvo en el escalón corrido', () => {
    const lote = groupIntoLotes([toma(1, 5)])[0]
    const p = buildLotePrompt({ lote, camara: 'Fija.', voz: VOZ, producto: '', images: [{ url: 'a', role: 'la persona' }] })
    expect(p).toMatch(/ningún gesto fuera de la lista/)
  })
})

describe('partirEnTramos y los conectores', () => {
  it('", luego <verbo>" abre un hecho nuevo; ", y luego a cámara" no', () => {
    expect(partirEnTramos('masajea las mejillas y el cuello, luego guarda el gotero en el frasco'))
      .toEqual(['masajea las mejillas y el cuello', 'guarda el gotero en el frasco'])
    expect(partirEnTramos('Mira el producto, y luego a cámara')).toEqual(['Mira el producto, y luego a cámara'])
    // el quinto sorteo real: un corte de 19 s con tres acciones en un solo hecho
    expect(partirEnTramos('Sujeto aplica una gota en la mejilla, posteriormente realiza movimientos circulares con los dedos, finalmente muestra el producto a cámara'))
      .toEqual(['Sujeto aplica una gota en la mejilla', 'realiza movimientos circulares con los dedos', 'muestra el producto a cámara'])
    expect(partirEnTramos('sostiene el producto con la mano derecha, se toca la mejilla y el mentón'))
      .toEqual(['sostiene el producto con la mano derecha', 'se toca la mejilla y el mentón'])
  })
})

describe('defectosDelForense', () => {
  const h = (desde: number, hasta: number, texto: string) => ({ desde, hasta, texto })
  // El tercer sorteo real de `00471f8a`: el render abrió destapando y tapando, sin gota.
  const C = (n: number, duracionSeg: number, hechos: ReturnType<typeof h>[], dialogo = '') => ({ n, tiempo: `00:00 - 00:${String(Math.round(duracionSeg)).padStart(2, '0')}`, duracionSeg, dialogo, hechos })
  it('caza la trayectoria sin evento: el aplicador sale y vuelve sin que el producto llegue al cuerpo', () => {
    // el cuarto sorteo real: "una gota suspendida" que nunca cae, y "cierra el cuentagotas"
    expect(defectosDelForense({ cortes: [C(1, 4, [
      h(0, 1.2, 'la mano derecha sostiene el tapón del cuentagotas con una gota suspendida, la mano izquierda sostiene el frasco'),
      h(1.2, 4.1, 'cierra el cuentagotas en el frasco, deja el frasco con ambas manos frente al pecho y lo muestra'),
    ])] })).toEqual(['corte 1: el aplicador sale y vuelve al envase sin que el producto llegue al cuerpo'])
    const d = defectosDelForense({ cortes: [C(1, 3.4, [
      h(0, 1.2, 'la mano derecha sostiene el cuentagotas sobre la mejilla, la izquierda sostiene el frasco'),
      h(1.2, 3.4, 'la mano derecha vuelve a introducir el cuentagotas en el frasco y cierra la tapa'),
    ])] })
    expect(d).toEqual(['corte 1: el aplicador sale y vuelve al envase sin que el producto llegue al cuerpo'])
    // "lo aplica en su mejilla" sin nombrar el producto también es la transferencia (quinto sorteo real)
    expect(defectosDelForense({ cortes: [C(1, 3, [h(0, 3, 'sostiene el frasco con la mano derecha, saca el cuentagotas con la izquierda, lo aplica en su mejilla derecha y vuelve a poner el cuentagotas')])] })).toEqual([])
    // con la gota escrita, no hay defecto
    expect(defectosDelForense({ cortes: [C(1, 3.4, [
      h(0, 1.2, 'la mano derecha suelta una gota con el cuentagotas sobre la mejilla, la izquierda sostiene el frasco'),
      h(1.2, 3.4, 'vuelve a insertar el gotero en el frasco'),
    ])] })).toEqual([])
  })
  it('caza el colapso: un corte largo con un solo hecho', () => {
    expect(defectosDelForense({ cortes: [C(4, 20, [h(0, 20, 'aplica el suero y masajea')])] })).toEqual(['corte 4: 20.0 s con un solo hecho'])
    // tres acciones en un hecho NO es colapso: se juzga después de expandir
    expect(defectosDelForense({ cortes: [C(4, 19, [h(0, 19, 'aplica una gota en la mejilla con la izquierda, posteriormente realiza movimientos circulares con los dedos, mientras sostiene el frasco')])] })).toEqual([])
    expect(defectosDelForense({ cortes: [C(2, 5, [h(0, 5, 'muestra el frasco')])] })).toEqual([])
    // un análisis anterior (sin hechos) no se juzga
    expect(defectosDelForense({ cortes: [C(1, 20, [])] })).toEqual([])
  })

  // El cuarto sorteo real: dos frases en una ventana de 4 s y la línea de la marca en dos cortes.
  it('caza el reparto del diálogo: repetido, indecible en su ventana, o que no reconstruye el guion', () => {
    const linea = 'Este es el serum antienvejecimiento de la marca Apivita y se llama Beevine Elixir.'
    const d = defectosDelForense({
      guionOriginal: `Este serum esta cambiando la piel. ${linea} Y me encanta.`,
      cortes: [
        { ...C(1, 4, [h(0, 4, 'muestra el frasco')], 'Este serum esta cambiando la piel. Si tu tambien estas casi a punto de entrar a los 30 como yo, es momento de empezar.'), tiempo: '00:00 - 00:04' },
        { ...C(2, 6, [h(0, 6, 'muestra el frasco')], linea), tiempo: '00:04 - 00:10' },
        { ...C(3, 5, [h(0, 5, 'muestra el frasco')], linea), tiempo: '00:10 - 00:15' },
      ],
    })
    expect(d).toContain('corte 3: repite el diálogo del corte 2')
    expect(d.some((x) => x.startsWith('corte 1:') && x.includes('car/s'))).toBe(true)
    expect(d.some((x) => x.startsWith('la suma de los diálogos'))).toBe(true)
  })
})

describe('LOTE_MAX_CHARS', () => {
  it('cierra el lote por caracteres de locución aunque los segundos entren', () => {
    const larga = (n: number) => toma(n, 5, 'x'.repeat(200))
    // 10 s entran en 15, 400 caracteres no entran en 300
    const l = groupIntoLotes([larga(1), larga(2)])
    expect(LOTE_MAX_CHARS).toBe(300)
    expect(l).toHaveLength(2)
    // una toma que SOLA se pasa igual entra en su propio lote
    expect(groupIntoLotes([toma(1, 5, 'y'.repeat(400))])).toHaveLength(1)
  })
})
