import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { buildForensicInstruction, camaraDeCorte, ForensicReportSchema, normalizarCamara, repairCutTiming, normalizarHechos, CPS_MAX, MIN_VISIBLE_SEG, type ForensicReport } from './forensic'

// El prompt es el contrato con Gemini. Estos asserts fijan las reglas del spec que,
// si se caen, producen el bug que ya vimos en producción: cortes inventados por
// cambio de diálogo y subtítulos tratados como contenido.

describe('buildForensicInstruction', () => {
  const p = buildForensicInstruction()

  it('prohíbe partir una toma continua por cambio de diálogo', () => {
    expect(p).toContain('cambio visual real o un corte de edición')
    expect(p).toMatch(/no dividas.*toma continua/i)
  })

  it('exige transcripción literal con sus errores', () => {
    expect(p).toMatch(/literal/i)
    expect(p).toContain('[inaudible]')
    expect(p).toMatch(/no resumir|no corregir|no parafrasear/i)
  })

  it('pide los gráficos SOLO para entender el original', () => {
    expect(p).toMatch(/no deben reproducirse/i)
  })

  // El acento SÍ se infiere ahora, pero del personaje que sube el usuario (FASE 4) y
  // no del sujeto del video, que es otra persona. Lo que sigue prohibido acá es
  // etiquetar a ese sujeto con una raza o un origen que el video no puede sostener.
  it('describe al sujeto sin etiquetarlo con una raza o un origen', () => {
    expect(p).toMatch(/No etiquetes al sujeto/i)
    expect(p).toMatch(/raza|etnia/i)
    expect(p).toMatch(/tono de piel, cabello, facciones/i)
  })

  // La directriz que el dueño del repo fijó como regla principal de esta fase.
  it('lleva la lista de inspección cronológica completa', () => {
    expect(p).toMatch(/inspecciona el video CRONOLÓGICAMENTE/i)
    for (const item of ['silencios', 'jump cuts', 'zooms', 'gestos', 'overlays', 'subtítulos', 'fondos']) {
      expect(p).toContain(item)
    }
  })

  // Los dieciocho puntos son qué MIRAR, no campos nuevos: un campo que solapa con otro
  // ya contestado vuelve vacío, y este repo lo pagó cinco veces.
  it('mapea esa lista a los campos que ya existen, sin inventar claves', () => {
    expect(p).toMatch(/DÓNDE VA CADA COSA DE ESA LISTA/)
    expect(p).toMatch(/No inventes campos fuera del esquema/)
  })

  it('registra la mano de cámara por corte y deja el campo global solo como resumen legado', () => {
    expect(p).toMatch(/`manoQueGraba`: resumen LEGADO/)
    expect(p).toMatch(/`cortes\[\]\.manoQueGraba`/)
    expect(p).toMatch(/durante TODO ESE CORTE/)
    expect(p).toMatch(/no prolongues el estado selfie más allá del corte observado/i)
  })

  it('exige una matriz de cámara independiente por corte y prohíbe completar lo ausente', () => {
    expect(p).toMatch(/SE MIDE DE NUEVO EN CADA CORTE, NUNCA SE HEREDA/)
    for (const campo of ['soporteCamara', 'movimientoCamara', 'encuadreCamara', 'anguloCamara', 'evidenciaCamara']) {
      expect(p).toContain(`\`${campo}\``)
    }
    expect(p).toMatch(/PROHIBIDO COPIAR O COMPLETAR CÁMARA/)
    expect(p).toMatch(/Ante cualquier duda, `indeterminado`; inventar una cámara está prohibido/)
    expect(p).toMatch(/que la persona camine dentro de un cuadro inmóvil NO es travelling/)
    expect(p).toMatch(/que mire arriba NO vuelve contrapicado/)
    expect(p).toMatch(/CRUCE FÍSICO OBLIGATORIO/)
    expect(p).toMatch(/la mano que graba\s+no puede sostener a la vez el producto ni aparecer gesticulando/)
    expect(p).toMatch(/"fija" exige cuadro inmóvil/)
  })

  // El render reconstruye un video: "muestra el producto" hace que el generador invente
  // un gesto y el resultado deje de parecerse al original. Caso real: el forense capturó
  // el gotero y el giro del frasco, pero el nivel de detalle no estaba exigido.
  it('exige coreografía de manos, no un resumen de la acción', () => {
    expect(p).toMatch(/qué mano usa y cómo agarra/i)
    expect(p).toMatch(/ENTRA al cuadro/i)
    expect(p).toMatch(/mano libre/i)
    expect(p).toContain('"muestra el producto" es inservible')
  })

  it('pide español para lo que ve el usuario', () => {
    expect(p).toMatch(/español/i)
  })

  // El análisis devolvía los límites cuadrados en una rejilla de 5 s y con diálogos que
  // no caben en su propio corte. El prompt es una pasada; lo que lo hace cumplir es
  // `repairCutTiming`.
  it('prohíbe la rejilla de segundos redondos y exige diálogo decible', () => {
    expect(p).toMatch(/decimales/i)
    expect(p).toMatch(/rejilla/i)
    expect(p).toMatch(/SE PUEDA DECIR/)
    expect(p).toContain(String(CPS_MAX))
  })
})

describe('schema de cámara por corte', () => {
  const legacy = {
    duracionTotalSeg: 5, caracteresGuion: 4, guionOriginal: 'Hola',
    sujeto: '', vestuario: '', producto: '', fondo: '', elementosGraficos: '',
    cortes: [{ n: 1, tiempo: '00:00 - 00:05', duracionSeg: 5, accion: '', hechos: [], camara: 'Fija', dialogo: 'Hola', textoOverlay: 'No aparece', transicion: 'final' }],
    tomas: [{ n: 1, encuadre: 'medio', posicion: 'frontal', accionFisica: 'habla', objeto: '', dialogo: 'Hola', duracionSeg: 5 }],
    edicion: { sincronizacion: '', textoOverlay: '', escalaZoom: '', cortes: '', ritmo: '', corteFinal: '' },
    resumenParaUsuario: '',
  }

  it('mantiene sesiones anteriores y obliga al modelo a emitir la matriz nueva', () => {
    expect(ForensicReportSchema.parse(legacy).manoQueGraba).toBe('')
    const schema = z.toJSONSchema(ForensicReportSchema) as { required?: string[]; properties?: { cortes?: { items?: { required?: string[] } } } }
    expect(schema.required ?? []).toContain('manoQueGraba')
    const requiredCorte = schema.properties?.cortes?.items?.required ?? []
    for (const campo of ['soporteCamara', 'movimientoCamara', 'encuadreCamara', 'anguloCamara', 'manoQueGraba', 'evidenciaCamara']) {
      expect(requiredCorte).toContain(campo)
    }
  })

  it('deriva la descripción canónica sin rellenar dimensiones indeterminadas', () => {
    const corte = {
      camara: 'texto libre que no debe ganar', soporteCamara: 'selfie_en_mano' as const,
      movimientoCamara: 'deriva suave a la derecha', encuadreCamara: 'plano medio corto',
      anguloCamara: 'indeterminado', manoQueGraba: 'izquierda' as const,
      evidenciaCamara: 'microtemblor solidario al brazo',
    }
    expect(camaraDeCorte(corte)).toBe('selfie sostenida por la persona, deriva suave a la derecha, plano medio corto')
    const report = ForensicReportSchema.parse({ ...legacy, cortes: [{ ...legacy.cortes[0], ...corte }] })
    expect(normalizarCamara(report).cortes[0].camara).toBe(camaraDeCorte(corte))
    expect(camaraDeCorte({ camara: 'Cámara fija, primer plano' })).toBe('Cámara fija, primer plano')
  })

  it('la evidencia de movimiento gana sobre una etiqueta fija contradictoria', () => {
    expect(camaraDeCorte({
      soporteCamara: 'selfie_en_mano', movimientoCamara: 'fija',
      encuadreCamara: 'plano medio corto', anguloCamara: 'nivel de ojos frontal',
      evidenciaCamara: 'microtemblor solidario al brazo izquierdo',
    })).toBe('selfie sostenida por la persona, movimiento observado: microtemblor solidario al brazo izquierdo, plano medio corto, nivel de ojos frontal')
  })
})

// La columna vertebral de todo el sistema: la duración de cada corte es la que termina
// pidiéndosele a KIE. En la sesión real el TOTAL era creíble (776 car / 46 s = 16.9 cps)
// pero el reparto no: el corte 2 traía 60 caracteres en 2 s = 30 cps, indecible.
describe('normalizarHechos', () => {
  const corte = (over: Record<string, unknown>) => ({
    n: 1, tiempo: '00:15 - 00:35', duracionSeg: 20, accion: '', camara: 'fija', dialogo: 'habla',
    textoOverlay: 'No aparece', transicion: 'corte directo', hechos: [] as { desde: number; hasta: number; texto: string }[], ...over,
  })
  const informe = (c: ReturnType<typeof corte>) => ({
    duracionTotalSeg: 20, caracteresGuion: 5, guionOriginal: 'habla', sujeto: '', vestuario: '', producto: '', fondo: '',
    elementosGraficos: '', cortes: [c], tomas: [], edicion: { sincronizacion: '', textoOverlay: '', escalaZoom: '', cortes: '', ritmo: '', corteFinal: '' },
    resumenParaUsuario: '',
  }) as unknown as ForensicReport

  it('ordena, rellena los huecos con el último estado de manos y deriva `accion`', () => {
    const { report, rellenos } = normalizarHechos(informe(corte({ hechos: [
      { desde: 12, hasta: 20, texto: 'mira a cámara y señala' },
      { desde: 0, hasta: 2, texto: 'sujeta el frasco con la mano derecha' },
      { desde: 2, hasta: 6, texto: 'aplica una gota con el cuentagotas' },
    ] })))
    const c = report.cortes[0]
    expect(c.hechos.map((h) => [h.desde, h.hasta])).toEqual([[0, 2], [2, 6], [6, 12], [12, 20]])
    expect(c.hechos[2].texto).toBe('sujeta el frasco con la mano derecha y habla a cámara')
    expect(rellenos).toHaveLength(1)
    expect(c.accion).toBe('sujeta el frasco con la mano derecha; aplica una gota con el cuentagotas; sujeta el frasco con la mano derecha y habla a cámara; mira a cámara y señala.')
  })

  it('un estado "con la derecha" sin la palabra mano también se hereda (relleno de huecos)', () => {
    const { report } = normalizarHechos(informe(corte({ hechos: [
      { desde: 0, hasta: 2, texto: 'sostiene el frasco con la derecha' },
      { desde: 8, hasta: 20, texto: 'mira a cámara' },
    ] })))
    expect(report.cortes[0].hechos[1].texto).toBe('sostiene el frasco con la derecha y habla a cámara')
  })

  it('corrige los tiempos contados desde el inicio del VIDEO en vez del corte', () => {
    const { report } = normalizarHechos(informe(corte({ hechos: [
      { desde: 15, hasta: 20, texto: 'sujeta el frasco con la mano derecha' },
      { desde: 20, hasta: 35, texto: 'extiende con las yemas' },
    ] })))
    expect(report.cortes[0].hechos.map((h) => [h.desde, h.hasta])).toEqual([[0, 5], [5, 20]])
  })

  it('un corte sin hechos (análisis anterior) no se toca, y un corte mudo rellena sin "habla"', () => {
    const viejo = informe(corte({ accion: 'sujeta el frasco', hechos: [] }))
    expect(normalizarHechos(viejo).report.cortes[0]).toBe(viejo.cortes[0])
    const { report } = normalizarHechos(informe(corte({ dialogo: '', hechos: [{ desde: 0, hasta: 4, texto: 'muestra el frasco' }] })))
    expect(report.cortes[0].hechos[1].texto).toBe('mantiene la postura, sin gesto nuevo')
  })
})

describe('repairCutTiming', () => {
  const corte = (n: number, duracionSeg: number, dialogo: string) => ({
    n, duracionSeg, dialogo,
    tiempo: `00:${String(n).padStart(2, '0')} - 00:${String(n + 1).padStart(2, '0')}`,
    accion: 'a', hechos: [], camara: 'c', textoOverlay: 'No aparece', transicion: 'corte directo',
  })
  const informe = (cortes: ReturnType<typeof corte>[]): ForensicReport => ({
    duracionTotalSeg: cortes.reduce((n, c) => n + c.duracionSeg, 0),
    caracteresGuion: cortes.reduce((n, c) => n + c.dialogo.length, 0),
    guionOriginal: cortes.map((c) => c.dialogo).join(' '),
    manoQueGraba: '',
    sujeto: '', vestuario: '', producto: '', fondo: '', elementosGraficos: '',
    cortes,
    tomas: cortes.map((c) => ({
      n: c.n, encuadre: '', posicion: '', accionFisica: '', objeto: '',
      dialogo: c.dialogo, duracionSeg: c.duracionSeg,
    })),
    edicion: { sincronizacion: '', textoOverlay: '', escalaZoom: '', cortes: '', ritmo: '', corteFinal: '' },
    resumenParaUsuario: '',
  })
  const cps = (c: { dialogo: string; duracionSeg: number }) => c.dialogo.length / c.duracionSeg

  // Un dato bueno no se toca: se devuelve el MISMO objeto, sin copiar ni recalcular.
  it('no toca un informe cuyos cortes ya son decibles', () => {
    const sano = informe([corte(1, 5, 'x'.repeat(70)), corte(2, 5, 'y'.repeat(60))])
    const r = repairCutTiming(sano)
    expect(r.ajustes).toEqual([])
    expect(r.report).toBe(sano)
  })

  it('baja el corte imposible exactamente al techo, no a un valor apenas mejor', () => {
    const { report } = repairCutTiming(informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40))]))
    expect(cps(report.cortes[0])).toBeCloseTo(CPS_MAX, 6)
    expect(report.cortes[0].duracionSeg).toBeCloseTo(3, 6)
  })

  // Lo que hace que la reparación sea conservadora: el ritmo global del original no se
  // altera porque el tiempo sale de donde sobra, no de la nada.
  it('conserva el total exacto: el tiempo sale de los cortes con holgura', () => {
    const antes = informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40)), corte(3, 8, 'v'.repeat(20))])
    const { report } = repairCutTiming(antes)
    const suma = report.cortes.reduce((n, c) => n + c.duracionSeg, 0)
    expect(suma).toBeCloseTo(20, 9)
    expect(report.duracionTotalSeg).toBe(20)
    // Los dos holgados ceden en proporción a su holgura, no a partes iguales.
    expect(report.cortes[1].duracionSeg).toBeLessThan(10)
    expect(report.cortes[2].duracionSeg).toBeLessThan(8)
  })

  it('ningún corte queda por debajo de su mínimo después de repartir', () => {
    const { report } = repairCutTiming(informe([
      corte(1, 1, 'a'.repeat(60)), corte(2, 1, 'b'.repeat(50)), corte(3, 20, 'c'.repeat(30)),
    ]))
    for (const c of report.cortes) expect(cps(c)).toBeLessThanOrEqual(CPS_MAX + 1e-9)
  })

  // El texto entero no entra en la duración del video: no hay de dónde sacar tiempo, así
  // que el total crece. Es el ÚNICO caso en que `duracionTotalSeg` se mueve.
  it('si no hay holgura en todo el video, el total crece y se reporta', () => {
    const { report } = repairCutTiming(informe([corte(1, 1, 'a'.repeat(60)), corte(2, 1, 'b'.repeat(60))]))
    expect(report.duracionTotalSeg).toBeCloseTo(6, 6)
    for (const c of report.cortes) expect(cps(c)).toBeCloseTo(CPS_MAX, 6)
  })

  // `tiempo` apunta a DÓNDE estaba el corte en el video fuente — el spec lo trata como
  // campo distinto de la duración. Además es la clave con la que `camaraDeLote` empareja
  // lote y plano, y entra en `scriptFingerprint`: moverla rompería las dos cosas.
  it('nunca toca la marca `tiempo`', () => {
    const antes = informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40))])
    const { report } = repairCutTiming(antes)
    expect(report.cortes.map((c) => c.tiempo)).toEqual(antes.cortes.map((c) => c.tiempo))
  })

  it('sincroniza las duraciones de `tomas` con las de `cortes`', () => {
    const { report } = repairCutTiming(informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40))]))
    expect(report.tomas.map((t) => t.duracionSeg)).toEqual(report.cortes.map((c) => c.duracionSeg))
  })

  it('deja `tomas` en paz si no hay una por corte', () => {
    const raro = { ...informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40))]) }
    raro.tomas = [raro.tomas[0]]
    expect(repairCutTiming(raro).report.tomas).toHaveLength(1)
  })

  // Sin esto, el error de coma flotante del reparto puede dejar un corte una billonésima
  // por debajo de su mínimo y una segunda pasada lo movería otra vez — dos huellas
  // distintas para el mismo contenido.
  it('es idempotente: la segunda pasada no mueve nada', () => {
    const uno = repairCutTiming(informe([
      corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(137)), corte(3, 3.7, 'v'.repeat(41)), corte(4, 8, 'u'.repeat(19)),
    ])).report
    const dos = repairCutTiming(uno)
    expect(dos.ajustes).toEqual([])
    expect(dos.report.cortes.map((c) => c.duracionSeg)).toEqual(uno.cortes.map((c) => c.duracionSeg))
  })

  it('reporta qué cortes movió y desde dónde', () => {
    const { ajustes } = repairCutTiming(informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40))]))
    expect(ajustes.find((a) => a.n === 1)).toMatchObject({ n: 1, de: 2 })
    expect(ajustes.find((a) => a.n === 1)!.a).toBeCloseTo(3, 6)
  })

  it('un corte sin diálogo no exige nada y conserva su duración de acción', () => {
    const { report } = repairCutTiming(informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, '')]))
    expect(report.cortes[1].duracionSeg).toBeCloseTo(9, 6)
  })

  // Un corte mudo tiene mínimo de habla 0: para el reparto era holgura pura y lo
  // vaciaba entero para financiar a los hablados (medido: 8 de 13 mudos de la base < 1 s).
  it('con piso visible, el corte mudo no se vacía y el hablado sigue siendo decible', () => {
    const sin = repairCutTiming(informe([corte(1, 1, 'z'.repeat(100)), corte(2, 4, '')]))
    expect(sin.report.cortes[1].duracionSeg).toBeLessThan(1)
    // el hablado necesita 5 s y tiene 2: el déficit de 3 sale ENTERO de la holgura del
    // mudo (6 − 3 = 3), que aterriza justo en el piso en vez de en 1 s
    const con = repairCutTiming(informe([corte(1, 2, 'z'.repeat(100)), corte(2, 6, '')]), MIN_VISIBLE_SEG)
    expect(con.report.cortes[1].duracionSeg).toBeCloseTo(MIN_VISIBLE_SEG, 6)
    expect(cps(con.report.cortes[0])).toBeLessThanOrEqual(CPS_MAX + 1e-9)
    // el piso se acota a lo que el corte ya tiene: no infla un mudo de 1 s a 3
    const corto = repairCutTiming(informe([corte(1, 5, 'z'.repeat(60)), corte(2, 1, '')]), MIN_VISIBLE_SEG)
    expect(corto.report).toBe(corto.report) // no lanza
    expect(corto.report.cortes[1].duracionSeg).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('sin diálogo en ningún corte no hay nada que reparar', () => {
    const mudo = informe([corte(1, 3, ''), corte(2, 4, '')])
    expect(repairCutTiming(mudo).report).toBe(mudo)
  })

  // Duraciones degeneradas: el saneo real vive en `sanearDuracion` (lotes.ts), pero esto
  // corre antes y no puede ser lo que reviente.
  it('no revienta con duraciones cero, negativas o no finitas', () => {
    const roto = informe([corte(1, 0, 'z'.repeat(20)), corte(2, -3, 'w'.repeat(10)), corte(3, 10, 'v'.repeat(10))])
    roto.cortes[1].duracionSeg = NaN
    const { report } = repairCutTiming(roto)
    for (const c of report.cortes) expect(Number.isFinite(c.duracionSeg)).toBe(true)
  })
})

describe('ForensicReportSchema', () => {
  it('acepta un informe completo', () => {
    const ok = ForensicReportSchema.safeParse({
      duracionTotalSeg: 28.3,
      caracteresGuion: 412,
      guionOriginal: 'este suero de niacinamida de anua y tengo que contarte',
      sujeto: 'Mujer de unos 25, cabello oscuro recogido, piel clara, ojos claros',
      vestuario: 'Polo azul marino con estampado de oso, pulsera dorada',
      producto: 'Frasco de vidrio rojo con gotero, etiqueta blanca',
      fondo: 'Dormitorio, pared clara, repisas blancas al fondo',
      elementosGraficos: 'Subtítulos blancos centrados abajo; marca de agua de TikTok',
      cortes: [{
        n: 1, tiempo: '00:00 - 00:03', duracionSeg: 3,
        accion: 'Sostiene el frasco frente a la cámara',
        camara: 'Primer plano, altura de ojos, cámara en mano',
        dialogo: 'este suero de niacinamida', textoOverlay: 'este suero de niacinamida',
        transicion: 'corte directo',
      }],
      tomas: [{
        n: 1, encuadre: 'Primer plano', posicion: 'Frente a cámara',
        accionFisica: 'Levanta el frasco', objeto: 'Frasco de suero',
        dialogo: 'este suero de niacinamida', duracionSeg: 3,
      }],
      edicion: {
        sincronizacion: 'Acción sincronizada con cada frase',
        textoOverlay: 'Subtítulos quemados en todo el video',
        escalaZoom: 'Sin zoom', cortes: 'Jump cuts secos',
        ritmo: 'Rápido, sin silencios', corteFinal: 'Placa de cierre de TikTok',
      },
      resumenParaUsuario: 'Testimonio en primera persona con demostración de uso.',
    })
    expect(ok.success).toBe(true)
  })

  it('rechaza un informe sin cortes', () => {
    expect(ForensicReportSchema.safeParse({ cortes: [] }).success).toBe(false)
  })
})


// Los dos defectos que el dueño del repo vio en los clips: una tercera mano, y un primer
// clip que no arranca aplicando el serum con el gotero en la mejilla. Los dos se leen en
// la `accion` del corte: nadie decía qué suelta cada mano, y el corte describía el viaje
// del cuentagotas sin nombrar nunca la gota saliendo.
describe('la accion encadena las manos y nombra la transferencia', () => {
  const plano = buildForensicInstruction().replace(/\s+/g, ' ')

  // La regla estaba escrita como un bullet entre ocho y NO se cumplió en la sesión que
  // el dueño del repo reportó (la toma 2 señalaba con la izquierda sin decir que había
  // soltado el cuentagotas). Se subió a TITULAR, que es la única palanca que este repo
  // tiene medida para eso, y se recortó el bullet para no decir la misma orden dos
  // veces dentro del mismo prompt.
  it('exige el estado de cada mano al empezar el corte, y como TITULAR', () => {
    expect(plano).toMatch(/CADA CORTE ABRE DICIENDO QUÉ TIENE CADA MANO/)
    expect(plano).toMatch(/Y CIERRA DICIENDO DÓNDE QUEDÓ CADA PIEZA QUE SALIÓ DEL ENVASE/)
    expect(plano).toMatch(/un brazo de más/)
    // "la mano libre" es el residuo medido: una descripción que no nombra la mano deja
    // sin decir qué sostiene, que es justo el dato que falta.
    expect(plano).not.toMatch(/qué hace la mano libre/)
  })

  // El forense leía este UGC como "Cámara fija" en 6 de 6 cortes sobre un original que
  // la creadora graba con el teléfono EN LA MANO mientras camina, y en los mismos cortes
  // le atribuía gestos a la mano que él mismo declaraba fuera de cuadro: el cuadro que se
  // mueve se estaba leyendo como un gesto. El bloque de cámara nombraba SOLO el caso del
  // teléfono apoyado, o sea le daba "fija" como el paradigma del formato.
  it('distingue selfie, cámara operada y soporte fijo sin usar un default', () => {
    expect(plano).toMatch(/`apoyada_o_tripode`/)
    expect(plano).toMatch(/`selfie_en_mano`/)
    expect(plano).toMatch(/`operador_en_mano`/)
    expect(plano).toMatch(/no lo deduzcas por estética UGC/i)
  })

  // La regla va donde se DECLARAN las manos, no en el bloque de cámara: este repo tiene
  // medido cuatro veces que una regla lejos de su campo es una sugerencia.
  it('la mano que sostiene el teléfono está ocupada durante su corte y no gesticula', () => {
    const manos = plano.slice(plano.indexOf('CADA CORTE ABRE DICIENDO QUÉ TIENE CADA MANO'))
    expect(manos).toMatch(/SI LA PERSONA SE ESTÁ GRABANDO A SÍ MISMA EN ESTE CORTE, UNA DE SUS MANOS SOSTIENE EL TELÉFONO/)
    expect(manos).toMatch(/está ocupada y fuera de cuadro durante TODO ESE CORTE/)
    expect(manos).toMatch(/no se describe gesticulando/)
    expect(manos).toMatch(/eso es movimiento de CÁMARA/)
  })

  it('exige la transferencia como cláusula propia, no la trayectoria', () => {
    expect(plano).toMatch(/SI EL PRODUCTO TOCA EL CUERPO EN ESTE CORTE, ESE HECHO SE ESCRIBE PRIMERO/)
    expect(plano).toMatch(/CONSECUENCIAS de ese hecho/)
    expect(plano).toMatch(/sobre qué lado de qué zona/)
  })

  it('la coreografía va en `hechos` con ventana y cobertura total, y la cámara va por corte', () => {
    expect(plano).toMatch(/LA COREOGRAFÍA VA EN `hechos`/)
    expect(plano).toMatch(/`desde` y `hasta` en SEGUNDOS CONTADOS DESDE EL INICIO DEL CORTE/)
    expect(plano).toMatch(/LOS HECHOS CUBREN EL CORTE ENTERO, SIN HUECOS/)
    expect(plano).toMatch(/MATRIZ DE CÁMARA — SE MIDE DE NUEVO EN CADA CORTE/)
    // el schema exige la lista (en el required) y es infalible
    expect(ForensicReportSchema.shape.cortes.element.shape.hechos.safeParse(undefined).success).toBe(true)
  })

  it('exige dónde termina la pieza que se separa del producto', () => {
    expect(plano).toMatch(/cuentagotas o una tapa/)
  })
})
