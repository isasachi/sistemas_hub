import { describe, it, expect } from 'vitest'
import { extractSlots, fillTemplate, validateTemplate, assembleTemplate, rejectBadValues, alignSlots, capSlots } from './fill'
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

// Caso REAL: la FASE 2 marcó 17 huecos sobre 11 tomas, incluido un [Problema] sobre una
// edad. El prompt ya pide moderación y ya nombra ese caso; se acota en código.
describe('capSlots', () => {
  const tmpl = (locuciones: string[]): ScriptTemplate => ({
    ...T,
    tomas: locuciones.map((l, i) => ({ n: i + 1, locucion: l, accionVisual: 'a', duracionSeg: 5 })),
  })

  it('desmarca un hueco cuyo original es un número: vuelve la palabra, no queda blanco', () => {
    const { template, reporte } = capSlots(
      tmpl(['Si tú también estás casi a punto de entrar a los [Problema] como yo,']),
      [{ n: 1, dialogo: 'Si tú también estás casi a punto de entrar a los 30 como yo,' }],
    )
    expect(template.tomas[0].locucion).toBe('Si tú también estás casi a punto de entrar a los 30 como yo,')
    expect(reporte.desmarcados).toEqual(['30'])
    expect(reporte.despues).toBe(0)
  })

  // Tres blancos que pedían tres datos se vuelven uno que pide una lista. No se pierde
  // nada: la enumeración es una sola pieza de información.
  it('fusiona una enumeración del mismo nombre en un solo hueco', () => {
    const { template, reporte } = capSlots(
      tmpl(['Este [Producto] contiene [Ingrediente], [Ingrediente] y [Ingrediente].']),
      [{ n: 1, dialogo: 'Este serum contiene ácido hialurónico, niacinamida y propóleo.' }],
    )
    expect(template.tomas[0].locucion).toBe('Este [Producto] contiene [Ingrediente].')
    expect(reporte.fusionados).toBe(2)
    expect(reporte.antes).toBe(4)
    expect(reporte.despues).toBe(2)
  })

  // El hueco fusionado tiene que cubrir la lista ENTERA, no solo el primer elemento:
  // si no, "niacinamida y propóleo" se quedarían literales en el anuncio de otro producto.
  it('el hueco fusionado cubre la lista completa, comas y conjunción incluidas', () => {
    const { template } = capSlots(
      tmpl(['Contiene [Ingrediente], [Ingrediente] y [Ingrediente].']),
      [{ n: 1, dialogo: 'Contiene ácido hialurónico, niacinamida y propóleo.' }],
    )
    expect(fillTemplate(template, { 'Ingrediente#1': 'X e Y' }).tomas[0].locucion).toBe('Contiene X e Y.')
  })

  it('no fusiona dos huecos del mismo nombre separados por texto real', () => {
    const { template, reporte } = capSlots(
      tmpl(['Este es el [Producto] de la marca [Producto].']),
      [{ n: 1, dialogo: 'Este es el serum de la marca Apivita.' }],
    )
    expect(template.tomas[0].locucion).toBe('Este es el [Producto] de la marca [Producto].')
    expect(reporte.fusionados).toBe(0)
  })

  it('no fusiona huecos contiguos de nombres distintos', () => {
    const { reporte } = capSlots(
      tmpl(['Da [Beneficio] y [Resultado].']),
      [{ n: 1, dialogo: 'Da luminosidad y lifting.' }],
    )
    expect(reporte.fusionados).toBe(0)
    expect(reporte.despues).toBe(2)
  })

  // La razón por la que la lista de universales son SOLO números: desmarcar deja la
  // palabra original en el guión, y el guión termina siendo un anuncio publicado.
  it('NUNCA desmarca un ingrediente o una marca para bajar el conteo', () => {
    const { template, reporte } = capSlots(
      tmpl(['Contiene [Ingrediente] de la marca [Producto].']),
      [{ n: 1, dialogo: 'Contiene propóleo de la marca Apivita.' }],
    )
    expect(template.tomas[0].locucion).toBe('Contiene [Ingrediente] de la marca [Producto].')
    expect(reporte.desmarcados).toEqual([])
    expect(reporte.despues).toBe(2)
  })

  it('deja intacta la toma cuyo andamiaje no copia su corte, y la reporta', () => {
    const { template, reporte } = capSlots(
      tmpl(['Este [Producto] transformó mi piel.']),
      [{ n: 1, dialogo: 'Este serum me cambió la piel.' }],
    )
    expect(template.tomas[0].locucion).toBe('Este [Producto] transformó mi piel.')
    expect(reporte.desalineadas).toEqual([1])
  })

  it('una toma sin corte correspondiente se deja como está', () => {
    const { template } = capSlots(tmpl(['Este [Producto] es bueno.']), [])
    expect(template.tomas[0].locucion).toBe('Este [Producto] es bueno.')
  })

  it('rehace el guión completo con las locuciones acotadas', () => {
    const { template } = capSlots(
      tmpl(['A los [Problema] pasa esto.', 'Contiene [Ingrediente] y [Ingrediente].']),
      [{ n: 1, dialogo: 'A los 30 pasa esto.' }, { n: 2, dialogo: 'Contiene agua y sal.' }],
    )
    expect(template.guionFillInBlank).toBe('A los 30 pasa esto. Contiene [Ingrediente].')
  })

  // Correr el acotado dos veces no puede seguir bajando el conteo: si lo hiciera, dos
  // extracciones de la misma plantilla darían guiones distintos.
  it('es idempotente', () => {
    const cortes = [{ n: 1, dialogo: 'Contiene ácido hialurónico, niacinamida y propóleo, a los 30.' }]
    const uno = capSlots(tmpl(['Contiene [Ingrediente], [Ingrediente] y [Ingrediente], a los [Problema].']), cortes)
    const dos = capSlots(uno.template, cortes)
    expect(dos.template.tomas[0].locucion).toBe(uno.template.tomas[0].locucion)
    expect(dos.reporte.antes).toBe(dos.reporte.despues)
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
