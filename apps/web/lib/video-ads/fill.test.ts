import { describe, it, expect } from 'vitest'
import { extractSlots, fillTemplate, validateTemplate, assembleTemplate, rejectBadValues, alignSlots, normalizeSlots, resolveSlotId, acceptScaffoldFix, acceptRewrite } from './fill'
import type { ScriptTemplate } from './template'

// Plantilla recortada del caso real (serum Apivita → suero de niacinamida). Trae los
// dos casos que rompían: el mismo nombre de hueco dos veces con valores distintos
// (cara / cuello) y palabras funcionales que deben sobrevivir intactas.
const T: ScriptTemplate = {
  guionFillInBlank: 'no se usa',
  escenario: {
    publicoObjetivo: '', problemaDeseo: '', personaje: '', vestuario: '',
    producto: '', caracteristicasProducto: '', fondo: '', objetosSecundarios: '',
  },
  tomas: [
    { n: 1, locucion: 'Este [producto] me está cambiando mi [parte del cuerpo].', accionVisual: 'Sostiene el [producto] con ambas manos.', duracionSeg: 6 },
    { n: 2, locucion: 'Lo uso en [parte del cuerpo] y en [parte del cuerpo].', accionVisual: 'Aplica en [parte del cuerpo].', duracionSeg: 5 },
  ],
  edicion: { cortesPorSalto: '', ceroSilencios: '', zoom: '', ritmo: '', loopInfinito: '' },
  resumenParaUsuario: '',
}

describe('extractSlots', () => {
  it('numera cada aparición, aunque el nombre se repita', () => {
    const ids = extractSlots(T).map((s) => s.id)
    expect(ids).toEqual([
      'producto#1', 'parte del cuerpo#1', 'producto#2',
      'parte del cuerpo#2', 'parte del cuerpo#3', 'parte del cuerpo#4',
    ])
  })

  it('da contexto para que el valor se pueda elegir', () => {
    const s = extractSlots(T).find((x) => x.id === 'parte del cuerpo#2')!
    expect(s.contexto).toContain('Lo uso en')
    expect(s.contexto).toContain('⟦parte del cuerpo⟧')
  })

  it('distingue lo que se dice de lo que el cuerpo hace', () => {
    const s = extractSlots(T)
    expect(s.find((x) => x.id === 'producto#1')!.campo).toBe('locucion')
    expect(s.find((x) => x.id === 'producto#2')!.campo).toBe('accion')
  })
})

// Caso REAL de la sesión 79b94ab9. La plantilla marcó tres [Producto] en una sola
// frase y el modelo devolvió, como valor del primero, la oración entera ya rellenada.
// `fillTemplate` la copió literal dentro de la frase que ya la contenía y salió el
// texto que el usuario llamó "un monstruo de Frankenstein".
describe('rejectBadValues', () => {
  const T4: ScriptTemplate = {
    ...T,
    tomas: [{
      n: 1, duracionSeg: 5, accionVisual: 'Sostiene el frasco.',
      locucion: 'Este es el [Producto] de la marca [Producto] y se llama [Producto].',
    }],
  }

  it('rechaza el valor que trae la oración entera ya armada', () => {
    const { valores, rechazados } = rejectBadValues(T4, {
      'Producto#1': 'Este es el suero de la marca La Roche-Posay y se llama Suero de niacinamida',
    })
    expect(rechazados).toContain('Producto#1')
    expect(valores['Producto#1']).toBeUndefined()
  })

  // Lo que se rechaza queda como hueco, no como texto roto: el usuario lo escribe.
  it('lo rechazado sale como marcador pendiente, no como el valor malo', () => {
    const { valores } = rejectBadValues(T4, { 'Producto#1': 'Este es el suero de la marca X y se llama Y' })
    expect(fillTemplate(T4, valores).tomas[0].locucion)
      .toBe('Este es el [PENDIENTE: Producto] de la marca [PENDIENTE: Producto 2] y se llama [PENDIENTE: Producto 3].')
  })

  it('deja pasar los tres valores correctos, que son cortos y distintos', () => {
    const buenos = { 'Producto#1': 'suero', 'Producto#2': 'La Roche-Posay', 'Producto#3': 'Pure Niacinamide' }
    const { valores, rechazados } = rejectBadValues(T4, buenos)
    expect(rechazados).toEqual([])
    expect(fillTemplate(T4, valores).tomas[0].locucion)
      .toBe('Este es el suero de la marca La Roche-Posay y se llama Pure Niacinamide.')
  })

  // Tres palabras seguidas del andamiaje son la firma del eco. Dos no: "de la" aparece
  // en media lengua española y rechazarlo tumbaría valores legítimos.
  it('rechaza por eco de tres palabras del andamiaje, no por dos', () => {
    expect(rejectBadValues(T4, { 'Producto#2': 'de la marca X' }).rechazados).toContain('Producto#2')
    expect(rejectBadValues(T4, { 'Producto#2': 'de la' }).rechazados).toEqual([])
  })

  // Toma 6 de la sesión real. El eco se compara normalizado: sin acentos, sin
  // mayúsculas y sin puntuación, porque el modelo devuelve el eco reescrito, no
  // copiado byte a byte.
  it('el eco se compara sin acentos, mayúsculas ni puntuación', () => {
    const t: ScriptTemplate = {
      ...T,
      tomas: [{ n: 1, duracionSeg: 5, accionVisual: 'a', locucion: 'lo que nos ayuda a [Beneficio] las capas más profundas de la piel' }],
    }
    expect(rejectBadValues(t, { 'Beneficio#1': 'LO QUE NOS ayuda a hidratar' }).rechazados).toContain('Beneficio#1')
    expect(rejectBadValues(t, { 'Beneficio#1': 'las capas MAS profundas' }).rechazados).toContain('Beneficio#1')
    expect(rejectBadValues(t, { 'Beneficio#1': 'hidratar' }).rechazados).toEqual([])
  })

  it('rechaza un valor más largo que un sintagma corto', () => {
    expect(rejectBadValues(T4, { 'Producto#1': 'x'.repeat(61) }).rechazados).toContain('Producto#1')
    expect(rejectBadValues(T4, { 'Producto#1': 'x'.repeat(60) }).rechazados).toEqual([])
  })

  it('rechaza el nombre del propio hueco como valor', () => {
    expect(rejectBadValues(T4, { 'Producto#1': 'el producto de skincare' }).rechazados).toContain('Producto#1')
  })

  // Un hueco que el modelo dejó vacío ya es pendiente; no cuenta como rechazo.
  it('un valor vacío no se reporta como rechazado', () => {
    expect(rejectBadValues(T4, { 'Producto#1': '   ' }).rechazados).toEqual([])
  })

  // El andamiaje se compara por TOMA: una frase de la toma 2 no puede invalidar un
  // valor de la toma 1, porque no está escrita a su alrededor.
  it('solo compara contra el andamiaje de su propia toma', () => {
    const dos: ScriptTemplate = {
      ...T,
      tomas: [
        { n: 1, duracionSeg: 5, accionVisual: 'a', locucion: 'Yo uso [Producto] siempre.' },
        { n: 2, duracionSeg: 5, accionVisual: 'b', locucion: 'Este es el [Producto] que me gusta.' },
      ],
    }
    expect(rejectBadValues(dos, { 'Producto#1': 'este es el serum' }).rechazados).toEqual([])
  })
})

// El andamiaje fuera de los corchetes es idéntico al diálogo del corte (regla de copia
// de la FASE 2), así que lo que hay entre dos trozos literales es lo que se reemplazó.
describe('alignSlots', () => {
  it('recupera el texto original de cada hueco', () => {
    const r = alignSlots(
      'Este es el serum antienvejecimiento de la marca Apivita y se llama Beevine Elixir.',
      'Este es el [Producto] de la marca [Producto] y se llama [Producto].',
    )!
    expect(r.huecos.map((h) => h.original)).toEqual(['serum antienvejecimiento', 'Apivita', 'Beevine Elixir'])
  })

  it('sin huecos devuelve el diálogo entero como único literal', () => {
    expect(alignSlots('Me está encantando.', 'Me está encantando.')!.huecos).toEqual([])
  })

  it('resuelve un hueco al final de la frase', () => {
    expect(alignSlots('es el culpable de este glow', 'es el culpable de este [Beneficio]')!.huecos[0].original)
      .toBe('glow')
  })

  // Si el andamiaje no aparece en el diálogo, el modelo NO copió: reescribir esa
  // locución corrompería el texto, así que se abandona en vez de adivinar.
  it('devuelve null si el andamiaje no coincide con el diálogo', () => {
    expect(alignSlots('Este serum me cambió la piel.', 'Este [Producto] transformó mi piel.')).toBeNull()
  })
})

// Lo único que queda acá es corregir nombres genéricos. El recorte por conteo que esto
// hacía antes (desmarcar números, fusionar enumeraciones) se eliminó: iba en dirección
// contraria a la plantilla de referencia, que marca la edad y numera los ingredientes.
describe('normalizeSlots', () => {
  const tmpl = (locuciones: string[]): ScriptTemplate => ({
    ...T,
    tomas: locuciones.map((l, i) => ({ n: i + 1, locucion: l, accionVisual: 'a', duracionSeg: 5 })),
  })







  // Tres datos distintos con la misma etiqueta hacen que la FASE 3 les ponga el mismo
  // valor: "el suero de la marca suero y se llama suero". El prompt ya pide los tres
  // nombres; esto es el respaldo determinista para cuando no obedece.
  it('renombra los tres roles del producto por lo que tienen delante', () => {
    const { template, reporte } = normalizeSlots(
      tmpl(['Este es el [Producto] de la marca [Producto] y se llama [Producto].']),
      [{ n: 1, dialogo: 'Este es el serum antienvejecimiento de la marca Apivita y se llama Beevine Elixir.' }],
    )
    expect(template.tomas[0].locucion)
      .toBe('Este es el [Producto] de la marca [nombre de la marca] y se llama [nombre del producto].')
    expect(reporte.renombrados).toEqual(['Producto → nombre de la marca', 'Producto → nombre del producto'])
    // Y ahora cada hueco pide su propio dato en vez de tres veces el mismo.
    expect(fillTemplate(template, {
      'Producto#1': 'suero', 'nombre de la marca#1': 'La Roche-Posay', 'nombre del producto#1': 'Pure Niacinamide',
    }).tomas[0].locucion)
      .toBe('Este es el suero de la marca La Roche-Posay y se llama Pure Niacinamide.')
  })

  it('renombra también los otros nombres genéricos del producto', () => {
    const { template } = normalizeSlots(
      tmpl(['de la marca [Categoría del producto].']),
      [{ n: 1, dialogo: 'de la marca Apivita.' }],
    )
    expect(template.tomas[0].locucion).toBe('de la marca [nombre de la marca].')
  })

  // Un hueco que el modelo ya nombró bien no se toca: el respaldo solo pisa genéricos.
  it('no pisa un nombre que ya es específico', () => {
    const { template, reporte } = normalizeSlots(
      tmpl(['de la marca [Ingrediente].']),
      [{ n: 1, dialogo: 'de la marca propóleo.' }],
    )
    expect(template.tomas[0].locucion).toBe('de la marca [Ingrediente].')
    expect(reporte.renombrados).toEqual([])
  })

  it('no renombra un [Producto] que no viene detrás de un marcador de rol', () => {
    const { reporte } = normalizeSlots(
      tmpl(['Este [Producto] me cambió la piel.']),
      [{ n: 1, dialogo: 'Este serum me cambió la piel.' }],
    )
    expect(reporte.renombrados).toEqual([])
  })

  it('deja intacta la toma cuyo andamiaje no copia su corte, y la reporta', () => {
    const { template, reporte } = normalizeSlots(
      tmpl(['Este [Producto] transformó mi piel.']),
      [{ n: 1, dialogo: 'Este serum me cambió la piel.' }],
    )
    expect(template.tomas[0].locucion).toBe('Este [Producto] transformó mi piel.')
    expect(reporte.desalineadas).toEqual([1])
  })

  it('una toma sin corte correspondiente se deja como está', () => {
    const { template } = normalizeSlots(tmpl(['Este [Producto] es bueno.']), [])
    expect(template.tomas[0].locucion).toBe('Este [Producto] es bueno.')
  })


})

describe('fillTemplate', () => {
  const VALORES = {
    'producto#1': 'suero', 'parte del cuerpo#1': 'piel', 'producto#2': 'suero',
    'parte del cuerpo#2': 'cara', 'parte del cuerpo#3': 'cuello', 'parte del cuerpo#4': 'la cara',
  }

  // La razón de existir del módulo: fuera del corchete no cambia nada.
  it('copia literalmente todo lo que está fuera de los corchetes', () => {
    const r = fillTemplate(T, VALORES)
    expect(r.tomas[0].locucion).toBe('Este suero me está cambiando mi piel.')
    expect(r.tomas[1].locucion).toBe('Lo uso en cara y en cuello.')
  })

  it('el mismo nombre repetido recibe valores distintos', () => {
    const r = fillTemplate(T, VALORES)
    expect(r.tomas[1].locucion).toContain('cara y en cuello')
    expect(r.tomas[1].locucion).not.toContain('cara y en cara')
  })

  it('la numeración de relleno coincide con la de extracción', () => {
    const slots = extractSlots(T)
    const porId = Object.fromEntries(slots.map((s, i) => [s.id, `V${i}`]))
    const r = fillTemplate(T, porId)
    // Cada valor cae en el hueco de su propio índice, sin corrimientos.
    expect(r.tomas[0].locucion).toBe('Este V0 me está cambiando mi V1.')
    expect(r.tomas[0].accionVisual).toBe('Sostiene el V2 con ambas manos.')
    expect(r.tomas[1].locucion).toBe('Lo uso en V3 y en V4.')
  })

  it('un hueco sin valor queda como marcador pendiente identificable', () => {
    const r = fillTemplate(T, { 'producto#1': 'suero' })
    expect(r.tomas[0].locucion).toBe('Este suero me está cambiando mi [PENDIENTE: parte del cuerpo].')
    expect(r.tomas[1].locucion).toContain('[PENDIENTE: parte del cuerpo 2]')
    expect(r.tomas[1].locucion).toContain('[PENDIENTE: parte del cuerpo 3]')
  })

  it('un valor en blanco cuenta como pendiente, no como texto vacío', () => {
    const r = fillTemplate(T, { ...VALORES, 'producto#1': '   ' })
    expect(r.tomas[0].locucion).toContain('[PENDIENTE: producto]')
  })

  it('el guión final es la unión de las locuciones', () => {
    const r = fillTemplate(T, VALORES)
    expect(r.guionFinal).toBe('Este suero me está cambiando mi piel. Lo uso en cara y en cuello.')
  })

  it('conserva la duración de cada toma sin tocarla', () => {
    expect(fillTemplate(T, VALORES).tomas.map((t) => t.duracionSeg)).toEqual([6, 5])
  })
})

// El fallo que motivó el guard: FASE 2 devolvió las 9 tomas con el NOMBRE DEL CAMPO en
// vez del texto hablado. Como las locuciones son la fuente canónica del guión, el
// resultado fue un guión hecho solo de marcadores y el usuario vio el guión borrado.
describe('validateTemplate', () => {
  const conLocuciones = (locs: string[], guion = 'x'.repeat(30)): ScriptTemplate => ({
    ...T,
    guionFillInBlank: guion,
    tomas: locs.map((l, i) => ({ n: i + 1, locucion: l, accionVisual: 'a', duracionSeg: 5 })),
  })

  it('rechaza la plantilla donde la locución es el nombre del campo', () => {
    const r = validateTemplate(conLocuciones(['[Texto de locución]', '[Texto de locución]']))
    expect(r).toContain('2 de 2 tomas')
    expect(r).toContain('[Texto de locución]')
  })

  it('rechaza una sola toma degenerada entre varias buenas', () => {
    expect(validateTemplate(conLocuciones(['Este [producto] me cambió la vida y lo recomiendo.', '[Locución]'])))
      .toContain('1 de 2 tomas')
  })

  it('rechaza cuando las locuciones no cubren el guión', () => {
    expect(validateTemplate(conLocuciones(['corto'], 'y'.repeat(200))))
      .toMatch(/falta texto en las tomas/)
  })

  it('rechaza una plantilla sin tomas', () => {
    expect(validateTemplate({ ...T, tomas: [] })).toContain('no tiene tomas')
  })

  it('acepta una plantilla sana', () => {
    const guion = 'Este [producto] me cambió. Lo uso en [parte del cuerpo].'
    expect(validateTemplate(conLocuciones(['Este [producto] me cambió.', 'Lo uso en [parte del cuerpo].'], guion)))
      .toBeNull()
  })

  // Un hueco DENTRO de una locución real es lo normal; solo se rechaza cuando la
  // locución entera es un corchete.
  it('no confunde un hueco legítimo con una locución degenerada', () => {
    expect(validateTemplate(conLocuciones(['Yo uso [producto] todos los días sin falta.'], 'Yo uso [producto] todos los días sin falta.')))
      .toBeNull()
  })

  // El guard corre sobre datos que ya fallaron una vez; si él mismo revienta, el usuario
  // recibe un 500 sin explicación en vez del motivo. Pasó con un mock sin tomas.
  it('no revienta con una plantilla malformada: la reporta', () => {
    expect(validateTemplate({ ...T, tomas: undefined as never })).toContain('no tiene tomas')
  })
})

// Las tomas son los cortes del forense, no algo que el modelo re-particiona. Pedírselas
// produjo frases cortadas a la mitad y oraciones enteras dentro de un corchete.
describe('assembleTemplate', () => {
  const CORTES = [
    { n: 1, dialogo: 'Este serum me cambió la piel.', duracionSeg: 6, accion: 'Sostiene el frasco y lo gira.' },
    { n: 2, dialogo: 'Lo uso en cara y en cuello.', duracionSeg: 5, accion: 'Aplica en la mejilla derecha.' },
  ]
  const DRAFT = {
    locuciones: [
      { n: 1, texto: 'Este [producto] me cambió la [parte del cuerpo].' },
      { n: 2, texto: 'Lo uso en [parte del cuerpo] y en [parte del cuerpo].' },
    ],
    escenario: T.escenario, edicion: T.edicion, resumenParaUsuario: 'ok',
  }

  it('usa la duración y la acción del corte, no las del modelo', () => {
    const t = assembleTemplate(DRAFT, CORTES)
    expect(t.tomas.map((x) => x.duracionSeg)).toEqual([6, 5])
    expect(t.tomas[1].accionVisual).toBe('Aplica en la mejilla derecha.')
  })

  it('hay exactamente una toma por corte, en el mismo orden', () => {
    expect(assembleTemplate(DRAFT, CORTES).tomas.map((x) => x.n)).toEqual([1, 2])
  })

  it('el guión es la unión de las locuciones', () => {
    expect(assembleTemplate(DRAFT, CORTES).guionFillInBlank)
      .toBe('Este [producto] me cambió la [parte del cuerpo]. Lo uso en [parte del cuerpo] y en [parte del cuerpo].')
  })

  // Sin huecos esa frase no se podrá adaptar, pero el guion no pierde el texto.
  it('un corte sin locución devuelta cae a su diálogo crudo', () => {
    const t = assembleTemplate({ ...DRAFT, locuciones: [DRAFT.locuciones[0]] }, CORTES)
    expect(t.tomas[1].locucion).toBe('Lo uso en cara y en cuello.')
  })

  it('ignora locuciones de cortes que no existen', () => {
    const t = assembleTemplate({ ...DRAFT, locuciones: [...DRAFT.locuciones, { n: 99, texto: 'fantasma' }] }, CORTES)
    expect(t.tomas).toHaveLength(2)
    expect(t.guionFillInBlank).not.toContain('fantasma')
  })

  // Si el forense viniera sin cortes, el motivo tiene que salir por validateTemplate,
  // no como un 500 pelado desde el ensamblado.
  it('sin cortes devuelve tomas vacías en vez de reventar', () => {
    const t = assembleTemplate(DRAFT, [])
    expect(t.tomas).toEqual([])
    expect(validateTemplate(t)).toContain('no tiene tomas')
  })
})

// El fallo más caro es el que se reporta como éxito: el corrector de coherencia devolvía
// `situacion personal / edad / hito#1` (sin tilde) e `ingrediente 4` (sin `#1`), la
// búsqueda exacta no encontraba nada, la corrección se aplicaba a NADA y el log decía
// que se había aplicado.
describe('resolveSlotId', () => {
  const T5: ScriptTemplate = {
    ...T,
    tomas: [{
      n: 1, duracionSeg: 5, accionVisual: 'a',
      locucion: 'andas muy [situación personal / edad / hito] y tiene [ingrediente 4].',
    }],
  }
  const slots = extractSlots(T5)

  it('resuelve un id al que el modelo le comió las tildes', () => {
    expect(resolveSlotId(slots, 'situacion personal / edad / hito#1'))
      .toBe('situación personal / edad / hito#1')
  })

  it('resuelve un id sin el sufijo #n asumiendo la primera aparición', () => {
    expect(resolveSlotId(slots, 'ingrediente 4')).toBe('ingrediente 4#1')
  })

  it('tolera mayúsculas y espacios de más', () => {
    expect(resolveSlotId(slots, '  INGREDIENTE   4#1  ')).toBe('ingrediente 4#1')
  })

  // Devolver null en vez de un id cualquiera: el caller lo reporta en vez de tragárselo.
  it('devuelve null si no hay hueco que coincida', () => {
    expect(resolveSlotId(slots, 'hueco inventado#1')).toBeNull()
  })

  it('no confunde el hueco 2 con el 1 cuando el nombre se repite', () => {
    const dos = extractSlots({ ...T, tomas: [{ n: 1, duracionSeg: 5, accionVisual: 'a', locucion: '[x] y [x]' }] })
    expect(resolveSlotId(dos, 'x#2')).toBe('x#2')
    expect(resolveSlotId(dos, 'x')).toBe('x#1')
  })
})

// La ÚNICA excepción a la copia literal. Existe para las frases donde ningún valor cabe
// ("andas muy ___" con un producto que no tiene adjetivo que poner), y solo sobre el
// guión adaptado: la plantilla sigue siendo espejo del original.
describe('acceptScaffoldFix', () => {
  const ok = (r: ReturnType<typeof acceptScaffoldFix>) => r.ok
  const motivo = (r: ReturnType<typeof acceptScaffoldFix>) => (r.ok ? '' : r.motivo)

  // El caso real. Cambia 5 de 8 palabras: cualquier tope estricto de palabras lo
  // rechazaría, y es justo el arreglo que esto viene a permitir.
  it('acepta el arreglo mínimo que motivó la excepción', () => {
    expect(ok(acceptScaffoldFix({
      original: 'sobre todo si últimamente andas muy no puedo dormir por las noches',
      propuesta: 'sobre todo si últimamente andas sin poder dormir por las noches',
      valores: [],
    }))).toBe(true)
  })

  it('rechaza una frase nueva disfrazada de ajuste', () => {
    const r = acceptScaffoldFix({
      original: 'sobre todo si últimamente andas muy no puedo dormir por las noches',
      propuesta: 'descubre el secreto que miles de personas ya están probando hoy mismo',
      valores: [],
    })
    expect(ok(r)).toBe(false)
    expect(motivo(r)).toMatch(/palabras/)
  })

  // Los datos no se pueden perder: el ajuste toca el andamiaje, no el relleno.
  it('rechaza el ajuste que se lleva por delante un valor ya rellenado', () => {
    const r = acceptScaffoldFix({
      original: 'Número uno, contiene melatonina, te ayuda a dormir',
      propuesta: 'Número uno, te ayuda a dormir muy bien por la noche',
      valores: ['melatonina'],
    })
    expect(ok(r)).toBe(false)
    expect(motivo(r)).toContain('melatonina')
  })

  // Un pendiente lo escribe el usuario; no se resuelve por la puerta de atrás.
  it('rechaza el ajuste que hace desaparecer un pendiente', () => {
    const r = acceptScaffoldFix({
      original: 'Número dos, tiene [PENDIENTE: ingrediente 2] que ayuda al descanso',
      propuesta: 'Número dos, tiene valeriana que ayuda mucho al descanso',
      valores: [],
    })
    expect(ok(r)).toBe(false)
    expect(motivo(r)).toContain('PENDIENTE')
  })

  it('rechaza un ajuste que alarga o acorta demasiado', () => {
    expect(motivo(acceptScaffoldFix({
      original: 'andas muy cansada por las mañanas y no rindes',
      propuesta: 'andas mal',
      valores: [],
    }))).toMatch(/largo/)
  })

  it('rechaza un ajuste que no cambia nada y uno vacío', () => {
    const t = 'andas muy cansada'
    expect(ok(acceptScaffoldFix({ original: t, propuesta: t, valores: [] }))).toBe(false)
    expect(ok(acceptScaffoldFix({ original: t, propuesta: '   ', valores: [] }))).toBe(false)
  })

  it('rechaza el ajuste que mete marcadores nuevos', () => {
    expect(motivo(acceptScaffoldFix({
      original: 'Número uno, contiene melatonina para dormir mejor cada noche',
      propuesta: 'Número uno, contiene melatonina y [otro] para dormir cada noche',
      valores: ['melatonina'],
    }))).toMatch(/marcadores/)
  })
})

// El cambio de garantía CONSTRUCTIVA a VERIFICADA: el modelo redacta la frase (que es
// como lo hace el spec, y por eso le salen bien las costuras) y el código mide si se
// fue. Lo que no pasa cae al relleno determinista, que sigue siendo el piso.
describe('acceptRewrite', () => {
  const PLANTILLA = 'sobre todo si últimamente andas muy [situación personal] por las noches'
  const PISO = 'sobre todo si últimamente andas muy no puedo dormir por las noches'
  const base = { plantilla: PLANTILLA, piso: PISO, fuentes: ['no puedo dormir por las noches', 'cansada'] }

  it('acepta la redacción que arregla la costura conservando el andamiaje', () => {
    const r = acceptRewrite({ ...base, propuesta: 'sobre todo si últimamente andas muy cansada por las noches' })
    expect(r.ok).toBe(true)
  })

  // El fallo que hizo abandonar este enfoque: el modelo escribía otro anuncio. Se medía
  // 66-71% de fidelidad y no había forma de detectarlo; ahora cae al piso.
  it('rechaza otro anuncio disfrazado de adaptación', () => {
    const r = acceptRewrite({ ...base, propuesta: 'descubre hoy el secreto que miles de personas ya prueban' })
    expect(r.ok).toBe(false)
    expect(r.fidelidad).toBeLessThan(0.85)
  })

  // La reescritura es texto libre: no pasa por `rejectBadValues`. Caso real — afirmó que
  // unas gomitas de melatonina llevan "vitamina B6", que no está en ningún dato.
  it('rechaza la reescritura que afirma algo que no está en ninguna fuente', () => {
    const r = acceptRewrite({
      plantilla: 'Número dos, tiene [ingrediente 2] que también ayuda a [beneficio 2]',
      piso: 'Número dos, tiene melatonina que también ayuda a dormir',
      propuesta: 'Número dos, tiene vitamina B6 que también ayuda a dormir',
      fuentes: ['gomitas de melatonina', 'Melatonin 10mg Per Serving'],
    })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('vitamina')
  })

  // La flexión no es invención: la libertad gramatical es justo lo que esto viene a ganar.
  it('no confunde una conjugación distinta con un dato inventado', () => {
    const r = acceptRewrite({
      plantilla: 'te [beneficio 1] a dormir',
      piso: 'te ayuda a dormir',
      propuesta: 'te ayudan a dormir',
      fuentes: ['ayudar a dormir'],
    })
    expect(r.ok).toBe(true)
  })

  // `extractPending` bloquea el render; resolver un hueco por la puerta de atrás lo abre.
  it('rechaza la reescritura que resuelve sola un pendiente', () => {
    const r = acceptRewrite({
      ...base,
      piso: 'sobre todo si últimamente andas muy [PENDIENTE: situación personal] por las noches',
      propuesta: 'sobre todo si últimamente andas muy cansada por las noches',
    })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toMatch(/pendiente/)
  })

  it('rechaza una reescritura vacía o que cambia mucho de largo', () => {
    expect(acceptRewrite({ ...base, propuesta: '   ' }).ok).toBe(false)
    expect(acceptRewrite({ ...base, propuesta: 'andas mal' }).ok).toBe(false)
  })
})

// El eco es la firma de haber pegado un valor que ya traía las palabras de alrededor.
// `rejectBadValues` lo vigila en los valores; la reescritura es texto libre y no pasa
// por ahí. Caso real: "estás en mis veintitantos como yo como yo".
describe('acceptRewrite — eco', () => {
  it('rechaza la reescritura que repite un tramo dos veces seguidas', () => {
    const r = acceptRewrite({
      plantilla: 'Si tú también estás [situación personal] como yo,',
      piso: 'Si tú también estás en mis veintitantos como yo,',
      propuesta: 'Si tú también estás en mis veintitantos como yo como yo,',
      fuentes: ['en mis veintitantos'],
    })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('como yo')
  })

  it('no confunde una palabra repetida a distancia con un eco', () => {
    expect(acceptRewrite({
      plantilla: 'de día y de noche en [área] y en [área]',
      piso: 'de día y de noche en cara y en cuello',
      propuesta: 'de día y de noche en cara y en cuello',
      fuentes: ['cara', 'cuello'],
    }).ok).toBe(true)
  })
})

// `al` = a+el y `del` = de+el. Cuando el hueco se lleva el artículo la contracción
// desaparece y el modelo escribe la forma suelta — que es lo CORRECTO. Exigir copia
// byte a byte lo leía como "no copió" y descartaba la toma. Caso real: 2 de 7 tomas.
describe('alignSlots — contracciones', () => {
  it('tolera "ayuda al X" ↔ "ayuda a [X]"', () => {
    const r = alignSlots(
      'Número dos, tiene aguaje, que también ayuda al equilibrio hormonal y a la salud del cabello.',
      'Número dos, tiene [ingrediente 2], que también ayuda a [beneficio 1] y a la salud de [aspecto].',
    )!
    expect(r).not.toBeNull()
    expect(r.huecos.map((h) => h.original)).toEqual(['aguaje', 'equilibrio hormonal', 'cabello'])
  })

  it('sigue rechazando una paráfrasis de verdad', () => {
    expect(alignSlots('tiene aguaje que ayuda al cabello', 'tiene [x] que mejora a [y]')).toBeNull()
  })
})

// El mismo nombre en dos huecos hace que la FASE 3 les ponga el mismo valor — el fallo
// de los tres [Producto], reaparecido entre tomas.
describe('normalizeSlots — nombres que colisionan', () => {
  const tpl = (locs: string[]): ScriptTemplate => ({
    ...T,
    tomas: locs.map((l, i) => ({ n: i + 1, locucion: l, accionVisual: 'a', duracionSeg: 5 })),
  })

  it('numera por familia cuando el mismo nombre cubre datos distintos', () => {
    const { template, reporte } = normalizeSlots(
      tpl(['Te ayuda a [beneficio 1].', 'También ayuda a [beneficio 1].']),
      [{ n: 1, dialogo: 'Te ayuda a dormir.' }, { n: 2, dialogo: 'También ayuda a descansar.' }],
    )
    expect(template.tomas[0].locucion).toBe('Te ayuda a [beneficio 1].')
    expect(template.tomas[1].locucion).toBe('También ayuda a [beneficio 2].')
    expect(reporte.numerados).toHaveLength(1)
  })

  // Si el texto original coincide, es el MISMO dato y las dos apariciones tienen que
  // recibir la misma palabra: numerarlas produciría dos productos distintos.
  it('NO numera cuando el original dice lo mismo en los dos huecos', () => {
    const { template, reporte } = normalizeSlots(
      tpl(['Este [tipo de producto] va bien.', 'Ese [tipo de producto] también.']),
      [{ n: 1, dialogo: 'Este serum va bien.' }, { n: 2, dialogo: 'Ese serum también.' }],
    )
    expect(template.tomas[1].locucion).toContain('[tipo de producto]')
    expect(reporte.numerados).toEqual([])
  })

  // Se agrupa por familia (el nombre sin su número) porque el modelo ya numera a veces,
  // y mal: repetir `beneficio 1` es justo el defecto, así que saltarse los nombres con
  // dígito lo dejaba pasar. Renumerar la familia evita chocar con un `beneficio 2` real.
  it('renumera la familia entera sin chocar con un número ya usado', () => {
    const { template } = normalizeSlots(
      tpl(['Da [beneficio 1] y [beneficio 2].', 'Y también [beneficio 1].']),
      [{ n: 1, dialogo: 'Da energía y vitalidad.' }, { n: 2, dialogo: 'Y también calma.' }],
    )
    const nombres = [...template.tomas.map((t) => t.locucion).join(' ').matchAll(/\[([^\]]+)\]/g)].map((m) => m[1])
    expect(new Set(nombres).size).toBe(3)
    expect(nombres).toEqual(['beneficio 1', 'beneficio 2', 'beneficio 3'])
  })

  it('una toma que no alinea no se renumera ni rompe al resto', () => {
    const { template, reporte } = normalizeSlots(
      tpl(['Te ayuda a [beneficio 1].', 'Frase inventada con [beneficio 1].']),
      [{ n: 1, dialogo: 'Te ayuda a dormir.' }, { n: 2, dialogo: 'Otra cosa distinta acá.' }],
    )
    expect(reporte.desalineadas).toEqual([2])
    expect(template.tomas[1].locucion).toBe('Frase inventada con [beneficio 1].')
  })
})
