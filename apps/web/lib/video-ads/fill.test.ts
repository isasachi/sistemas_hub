import { describe, it, expect } from 'vitest'
import { extractSlots, fillTemplate, validateTemplate, assembleTemplate } from './fill'
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
