import { describe, it, expect } from 'vitest'
import { buildIdentityInstruction, buildCharacterParts, CharacterIdentitySchema, ACENTO_PENDIENTE } from './character'
import type { UserInputs } from './types'
import type { ForensicReport } from './forensic'
import type { Personaje } from './personajes'
import { NICHES_BLOQUEADOS } from './niches'

const INPUTS: UserInputs = {
  productName: 'Serum Eunoia', productDescription: 'Suero', angle: 'Testimonio',
  targetAudience: 'Mujeres 20-35', problem: 'Marcas de acné',
  characterDesc: 'Mujer de 25, cabello negro recogido, piel clara, ojos claros',
  characterEthnicity: 'Latina peruana', accent: 'Español peruano de Lima',
  voice: 'Femenina joven, ritmo conversacional', constraints: '',
}
const SIN_FOTO: Personaje = {
  id: 'P1', rol: 'protagonista', desc: 'Mujer de 25, cabello negro recogido, piel clara, ojos claros',
  etnia: 'Latina peruana', acento: 'Español peruano de Lima', voz: 'Femenina joven, ritmo conversacional',
  fotoUrl: null, avatarUrl: null, consistencyBlock: null, voiceProfile: null, motionProfile: null,
}
const CON_FOTO: Personaje = { ...SIN_FOTO, fotoUrl: 'https://cdn/foto.png' }

const FORENSIC = { sujeto: 'Mujer joven de cabello oscuro', vestuario: 'Polo azul', fondo: 'Dormitorio' } as ForensicReport

describe('buildIdentityInstruction', () => {
  it('prohíbe los cuatro atajos de identidad que el spec lista', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, [SIN_FOTO])
    expect(p).toMatch(/el mismo personaje/i)
    expect(p).toMatch(/igual al anterior/i)
    expect(p).toMatch(/idéntica persona/i)
    expect(p).toMatch(/as before/i)
    expect(p).toMatch(/no.*reemplac/i)
  })

  it('usa la etnia del usuario, literal', () => {
    expect(buildIdentityInstruction(INPUTS, FORENSIC, [SIN_FOTO])).toContain('Latina peruana')
  })

  // ⚠️ El acento salió del wizard (2026-08-25): la voz es un perfil FIJO en español
  // (`VOZ_POR_DEFECTO`). El prompt ya no lo pide ni propaga un marcador — y no debe
  // pedirlo, porque el usuario no tiene dónde escribirlo.
  it('ya no pide el acento ni lo propaga: la voz es fija', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, [{ ...SIN_FOTO, acento: '' }])
    expect(p).not.toContain(ACENTO_PENDIENTE)
    expect(p).toContain('sexoVocal')
    expect(p).toMatch(/siempre español latino neutro/i)
  })

  it('con imagen de referencia manda observar, no inventar', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, [CON_FOTO])
    expect(p).toMatch(/imagen de referencia/i)
    expect(p).toMatch(/no inventes/i)
  })

  it('con imagen, prohíbe inferir etnia o acento de la foto (mismo guard que sin imagen)', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, [CON_FOTO])
    expect(p).toMatch(/nunca infieras de la foto la etnia/i)
    expect(p).toMatch(/exclusivamente del usuario/i)
  })

  it('prohíbe overlays en la imagen del personaje', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, [SIN_FOTO])
    expect(p).toMatch(/sin texto|no text/i)
  })

  // El ratio del prompt tiene que coincidir con el de la llamada a Nano Banana Pro
  // (`aspectRatio: '9:16'` en character/route.ts). Antes era 2:3 porque gpt-image-2 solo
  // hacía retrato y el avatar era "una referencia más"; con el modo de frames de Veo esta
  // imagen ES el primer fotograma del clip, así que su encuadre es el del anuncio.
  it('pide 9:16 en el prompt de creación, no 2:3', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, [SIN_FOTO])
    expect(p).toMatch(/9:16/)
    expect(p).not.toMatch(/2:3/)
  })

  // ⚠️ El avatar es el primer fotograma del clip y de él salen todos los frames, así que
  // su fondo es el fondo del anuncio entero. Con "fondo neutro" —lo que pide la FASE 4
  // del spec para una foto de referencia— los cinco clips de la sesión `02fa1205`
  // salieron en un estudio blanco, siendo que el original transcurre en una tienda.
  it('sitúa al personaje en el escenario del original, no en fondo neutro', () => {
    const conTienda = { ...FORENSIC, fondo: 'Una tienda de ropa con maniquíes y estantes de vidrio.' } as ForensicReport
    const p = buildIdentityInstruction(INPUTS, conTienda, [SIN_FOTO])
    expect(p).toContain('Una tienda de ropa con maniquíes y estantes de vidrio.')
    expect(p).toMatch(/primer fotograma del anuncio, no un retrato de estudio/)
    expect(p).not.toMatch(/fondo neutro/)
  })

  it('sin fondo observado cae a algo genérico en vez de romperse', () => {
    const p = buildIdentityInstruction(INPUTS, { ...FORENSIC, fondo: '' } as ForensicReport, [SIN_FOTO])
    expect(p).toContain('interior con luz natural')
  })

  it('encuadra como foto de teléfono y prohíbe que se vea el teléfono', () => {
    // Medido con Nano Banana Pro: pedir "ángulo bajo como un teléfono apoyado en un
    // escritorio" hace que dibuje el teléfono en trípode dentro del cuadro.
    const p = buildIdentityInstruction(INPUTS, FORENSIC, [SIN_FOTO])
    expect(p).toMatch(/tel[eé]fono/i)
    expect(p).toMatch(/Sin tel[eé]fonos, c[aá]maras ni tr[ií]podes a la vista/i)
  })
})

/**
 * FASE 4.6 — el tercer artefacto. El fallo que existe para arreglar es que los renders
 * salían "robóticos", y la trampa es leer eso como falta de energía: un video sereno
 * también tiene movimiento fluido. Por eso son dos campos y no uno.
 */
describe('buildIdentityInstruction — perfil de movimiento', () => {
  const conMovimiento = {
    ...FORENSIC,
    edicion: { ritmo: 'Rápido y dinámico, cortes cada dos segundos' },
    cortes: [{ accion: 'la mujer levanta el frasco y lo gira' }],
  } as ForensicReport

  it('pide los DOS campos por separado', () => {
    const p = buildIdentityInstruction(INPUTS, conMovimiento, [SIN_FOTO])
    expect(p).toMatch(/calidadMovimiento/)
    expect(p).toMatch(/manerismos/)
  })

  it('separa explícitamente fluidez de energía — es la corrección que originó el campo', () => {
    const p = buildIdentityInstruction(INPUTS, conMovimiento, [SIN_FOTO])
    expect(p).toMatch(/FLUIDEZ Y ENERG[IÍ]A SON EJES DISTINTOS/)
    // El anti-ejemplo importa: "energía baja" es justo lo que devolvía un campo único.
    expect(p).toMatch(/"energía baja" NO lo es/)
  })

  it('le pasa el ritmo de edición y el movimiento de los cortes, que antes se tiraban', () => {
    const p = buildIdentityInstruction(INPUTS, conMovimiento, [SIN_FOTO])
    expect(p).toContain('Rápido y dinámico, cortes cada dos segundos')
    expect(p).toContain('la mujer levanta el frasco y lo gira')
  })

  it('sin ritmo medido lo dice, no lo inventa', () => {
    expect(buildIdentityInstruction(INPUTS, FORENSIC, [SIN_FOTO])).toContain('[no medido]')
  })
})

describe('buildCharacterParts', () => {
  it('sin imagen: un único part de texto', () => {
    const parts = buildCharacterParts('instrucción')
    expect(parts).toEqual([{ text: 'instrucción' }])
  })

  it('con imagen: el part de imagen va ANTES del de texto', () => {
    const parts = buildCharacterParts('instrucción', { data: 'YQ==', mimeType: 'image/png' })
    expect(parts).toHaveLength(2)
    expect(parts[0]).toEqual({ inlineData: { mimeType: 'image/png', data: 'YQ==' } })
    expect(parts[1]).toEqual({ text: 'instrucción' })
  })
})

describe('CharacterIdentitySchema', () => {
  it('acepta una identidad completa', () => {
    const ok = CharacterIdentitySchema.safeParse({
      promptCreacion: 'Retrato vertical de mujer de 25 años, cabello negro...',
      bloqueConsistencia: 'Mujer de 25 años, latina peruana, cabello negro liso recogido en moño bajo, piel clara, ojos marrón claro, complexión delgada, polo blanco de algodón sin estampado.',
      sexoVocal: 'mujer',
      edadVocal: '25-30 años',
      timbre: 'Claro y algo aniñado',
      movimiento: {
        calidadMovimiento: 'Movimientos continuos y pausados, sin cortes bruscos entre gestos; el peso se desplaza de una pierna a la otra al hablar y las manos siguen vivas cuando no señalan nada.',
        manerismos: 'Se acomoda el pelo detrás de la oreja al empezar cada frase y ladea la cabeza al escuchar.',
      },
    })
    expect(ok.success).toBe(true)
  })
})

/**
 * ROPA Y ZAPATOS: el producto y el vestuario son EL MISMO OBJETO.
 *
 * El bloque de consistencia describe el vestuario y viaja íntegro a cada lote junto a
 * `productDesc`; sin distinguir el nicho, el prompt afirma "viste camiseta rosa" (la
 * ropa del video original) y "el producto es una blusa crema" en el mismo texto. Y el
 * prompt del avatar pedía explícitamente "sin el producto en el encuadre", que para
 * ropa es justo al revés.
 */
describe('buildIdentityInstruction — producto que se lleva puesto', () => {
  const inputs = {
    productName: 'Camisa Mica', productDescription: 'Camisa de satén con frunces',
    angle: 'Prueba de producto', targetAudience: 'Mujeres de 20 a 35',
    problem: 'No encuentro una camisa que marque la cintura', characterDesc: 'Mujer de 25',
    characterEthnicity: 'Latina peruana', accent: 'Español peruano neutro', voice: '', constraints: '',
  }
  const forensic = {
    duracionTotalSeg: 28, caracteresGuion: 385, guionOriginal: 'x',
    sujeto: 'Mujer joven de cabello oscuro', vestuario: 'Camiseta rosa de manga larga',
    producto: 'Camisa', fondo: 'Pared blanca', elementosGraficos: 'Subtítulos',
    cortes: [{ n: 1, tiempo: '00:00 - 00:01', duracionSeg: 1, accion: 'a', camara: 'Plano medio', dialogo: 'd', textoOverlay: 'No aparece', transicion: 'corte', objetoEnMano: null, micro: null }],
    tomas: [{ n: 1, encuadre: 'Plano medio', posicion: 'De pie', accionFisica: 'a', objeto: 'camisa', dialogo: 'd', duracionSeg: 1 }],
    edicion: { sincronizacion: 'x', textoOverlay: 'x', escalaZoom: 'x', cortes: 'x', ritmo: 'x', corteFinal: 'x' },
    resumenParaUsuario: 'x',
  }

  it('en suplementos el prompt no cambia', () => {
    const p = buildIdentityInstruction(inputs, forensic, [SIN_FOTO], 'suplementos')
    expect(p).toContain('sin el producto en el encuadre')
    expect(p).not.toContain('LLEVA PUESTO')
  })

  // Una sesión anterior a la migración no trae nicho: tiene que leerse como antes.
  it('sin nicho se comporta como suplementos', () => {
    expect(buildIdentityInstruction(inputs, forensic, [SIN_FOTO]))
      .toBe(buildIdentityInstruction(inputs, forensic, [SIN_FOTO], 'suplementos'))
  })

  // BLOQUEO TEMPORAL de ropa y calzado (`NICHES_BLOQUEADOS`): mientras estén bloqueados,
  // esos nichos se leen como suplementos y el camino de prenda NO se activa, aunque la
  // sesión guardada diga 'ropa'.
  it('un nicho bloqueado NO activa el camino de prenda', () => {
    const base = buildIdentityInstruction(inputs, forensic, [SIN_FOTO], 'suplementos')
    for (const n of NICHES_BLOQUEADOS) {
      const p = buildIdentityInstruction(inputs, forensic, [SIN_FOTO], n)
      expect(p).toBe(base)
      expect(p).toContain('sin el producto en el encuadre')
      expect(p).not.toContain('LLEVA PUESTO')
    }
  })

  // Las dos de abajo cubren el camino de prenda, que hoy es INALCANZABLE por el bloqueo:
  // se saltan solas mientras el nicho esté bloqueado y vuelven a correr al vaciar
  // `NICHES_BLOQUEADOS`, sin que quien desbloquee tenga que acordarse de nada. Durante el
  // bloqueo las ramas `wornProduct` de character.ts y lotes.ts quedan sin ejercitar; lo
  // que sigue cubierto es el spec en sí (niches.test.ts).
  const bloqueado = (n: string) => (NICHES_BLOQUEADOS as readonly string[]).includes(n)

  it.skipIf(bloqueado('ropa'))('en ropa el avatar aparece VISTIENDO la prenda y el vestuario del original no manda', () => {
    const p = buildIdentityInstruction(inputs, forensic, [SIN_FOTO], 'ropa')
    expect(p).toContain('EL PRODUCTO ES ROPA Y EL PERSONAJE LO LLEVA PUESTO')
    expect(p).toContain('El producto SÍ va en el encuadre')
    expect(p).not.toContain('sin el producto en el encuadre')
    expect(p).toContain('el vestuario NO se copia')
    // …y el bloque de consistencia tiene que describir la prenda, que es lo único que
    // mantiene la misma ropa entre el lote 1 y el 5.
    expect(p).toContain('El vestuario que describas ES EL PRODUCTO')
  })

  it.skipIf(bloqueado('zapatos'))('en zapatos aplica el mismo eje', () => {
    const p = buildIdentityInstruction(inputs, forensic, [SIN_FOTO], 'zapatos')
    expect(p).toContain('EL PRODUCTO ES CALZADO Y EL PERSONAJE LO LLEVA PUESTO')
    expect(p).not.toContain('sin el producto en el encuadre')
  })
})

describe('buildCharacterParts — la prenda entra como imagen', () => {
  const img = { data: 'AAA', mimeType: 'image/png' }
  it('sin prenda se comporta como antes', () => {
    expect(buildCharacterParts('instr', img)).toHaveLength(2)
    expect(buildCharacterParts('instr')).toHaveLength(1)
  })
  // Sin verla, el modelo describe un vestuario inventado y el avatar sale con otra ropa.
  it('la prenda va después del personaje y antes del texto', () => {
    const parts = buildCharacterParts('instr', img, { data: 'BBB', mimeType: 'image/jpeg' })
    expect(parts).toHaveLength(3)
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'BBB' } })
    expect(parts[2]).toEqual({ text: 'instr' })
  })
})

/**
 * VARIOS PERSONAJES (slice 3). Se resuelven TODOS en una sola llamada a propósito: el
 * modelo los ve juntos y puede diferenciarlos. Una llamada por personaje devolvería
 * cuatro variantes de la misma persona, que es el fallo que este diseño evita.
 */
describe('buildIdentityInstruction — varios personajes', () => {
  const hijo: Personaje = {
    id: 'P1', rol: 'hijo', desc: 'Hombre de 30, con gafas', etnia: 'Latino mexicano',
    acento: 'Español mexicano', voz: 'Masculina joven', fotoUrl: null, avatarUrl: null,
    consistencyBlock: null, voiceProfile: null, motionProfile: null,
  }
  const padre: Personaje = {
    ...hijo, id: 'P2', rol: 'padre', desc: 'Hombre de 60, canoso, bigote',
    acento: 'Español mexicano rural', voz: 'Masculina mayor',
  }
  const p = buildIdentityInstruction(INPUTS, FORENSIC, [hijo, padre])

  it('lista a cada personaje con su id y su rol', () => {
    expect(p).toContain('[P1] hijo')
    expect(p).toContain('[P2] padre')
    expect(p).toContain('Hombre de 60, canoso, bigote')
  })

  it('exige que se vean Y suenen distintos — es el fallo que evita la llamada única', () => {
    expect(p).toMatch(/SON PERSONAS DISTINTAS Y TIENEN QUE VERSE DISTINTAS/)
    expect(p).toMatch(/tienen que SONAR distinto/)
    expect(p).toMatch(/rasgos\s+CONCRETOS/)
  })

  it('pide UNA entrada por personaje, con los ids exactos', () => {
    expect(p).toMatch(/UNA entrada por cada personaje/)
    expect(p).toContain('P1, P2')
    expect(p).toMatch(/No inventes personajes que no estén en la lista ni omitas ninguno/)
  })

  // Con la voz fija por sexo, `edadVocal` y `timbre` son lo ÚNICO que separa a dos
  // personajes del mismo sexo: sin eso el anuncio suena doblado por la misma persona.
  it('exige diferenciar la voz por edad y timbre', () => {
    expect(p).toMatch(/edadVocal. y .timbre. son lo ÚNICO que/)
  })

  it('con un solo personaje no aparece nada de todo eso', () => {
    const uno = buildIdentityInstruction(INPUTS, FORENSIC, [SIN_FOTO])
    expect(uno).not.toMatch(/SON PERSONAS DISTINTAS/)
    expect(uno).not.toMatch(/UNA entrada por cada personaje/)
    expect(uno).toMatch(/UNA sola entrada/)
  })

  it('un acento vacío ya no cambia nada del prompt', () => {
    const conHueco = buildIdentityInstruction(INPUTS, FORENSIC, [hijo, { ...padre, acento: '' }])
    expect(conHueco).toBe(buildIdentityInstruction(INPUTS, FORENSIC, [hijo, padre]))
  })
})

describe('buildCharacterParts — varias fotos', () => {
  it('mantiene el ORDEN de las fotos: mezclarlas le da a uno la cara de otro', () => {
    const parts = buildCharacterParts('x', [
      { data: 'AAA', mimeType: 'image/png' },
      { data: 'BBB', mimeType: 'image/jpeg' },
    ])
    expect(parts).toHaveLength(3)
    expect(parts[0]).toEqual({ inlineData: { mimeType: 'image/png', data: 'AAA' } })
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'BBB' } })
    expect(parts[2]).toEqual({ text: 'x' })
  })

  it('una sola foto sigue funcionando como antes', () => {
    const parts = buildCharacterParts('x', { data: 'AAA', mimeType: 'image/png' })
    expect(parts).toHaveLength(2)
  })
})
