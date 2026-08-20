import { describe, it, expect } from 'vitest'
import {
  personajesDe, resolvePersonaje, PersonajeSchema, MAX_PERSONAJES, ID_PRINCIPAL, nuevoId,
  hablantesPorTiempo, etiqueta, type Personaje,
} from './personajes'

const VOZ = {
  idioma: 'Español', varianteRegional: 'Perú', acento: 'Limeño', pronunciacion: 'Clara',
  ritmo: 'Conversacional', velocidad: 'Media', entonacion: 'Natural', energia: 'Media',
  pausas: 'Naturales', tono: 'Cálido', timbre: 'Claro', edadVocal: '25', estilo: 'Cercano',
}
const p = (over: Partial<Personaje> = {}): Personaje => ({
  id: 'P1', rol: 'protagonista', desc: 'Mujer de 25', etnia: 'Latina peruana',
  acento: 'Peruano de Lima', voz: '', fotoUrl: null, avatarUrl: null,
  consistencyBlock: null, voiceProfile: null, motionProfile: null, ...over,
})

/**
 * ⚠️ LA GARANTÍA CENTRAL DE ESTE MÓDULO: una sesión anterior a la columna `personajes`
 * tiene que comportarse EXACTAMENTE como antes. Todo el pipeline lee por acá, así que si
 * el fallback se rompe, se rompen todas las sesiones guardadas a la vez.
 */
describe('personajesDe — sesiones legadas', () => {
  const legada = {
    character_url: 'https://cdn/foto.png',
    avatar_url: 'https://cdn/avatar.png',
    character_desc: 'Mujer de 25, cabello castaño',
    character_ethnicity: 'Latina peruana',
    accent: 'Español peruano de Lima',
    voice: 'Femenina joven',
    consistency_block: 'Mujer de 25 años, latina peruana…',
    voice_profile: VOZ,
    motion_profile: { calidadMovimiento: 'Continuo', manerismos: 'Se acomoda el pelo' },
  }

  it('arma UN personaje con las columnas singulares', () => {
    const [uno, ...resto] = personajesDe(legada)
    expect(resto).toHaveLength(0)
    expect(uno.id).toBe(ID_PRINCIPAL)
    expect(uno.desc).toBe('Mujer de 25, cabello castaño')
    expect(uno.etnia).toBe('Latina peruana')
    expect(uno.acento).toBe('Español peruano de Lima')
    expect(uno.fotoUrl).toBe('https://cdn/foto.png')
    expect(uno.avatarUrl).toBe('https://cdn/avatar.png')
    expect(uno.consistencyBlock).toBe('Mujer de 25 años, latina peruana…')
    expect(uno.voiceProfile).toEqual(VOZ)
    expect(uno.motionProfile?.manerismos).toBe('Se acomoda el pelo')
  })

  it('nunca devuelve una lista vacía, ni con la sesión en blanco', () => {
    // Los pasos de abajo esperan al menos el protagonista; un array vacío obligaría a
    // todos a mirar ese caso.
    for (const entrada of [null, undefined, {}, { personajes: null }, { personajes: [] }]) {
      expect(personajesDe(entrada as never)).toHaveLength(1)
    }
  })

  it('un jsonb corrupto cae al camino legado en vez de romper', () => {
    const r = personajesDe({ ...legada, personajes: [{ id: 'P1' }] } as never)
    expect(r).toHaveLength(1)
    expect(r[0].etnia).toBe('Latina peruana')
  })
})

describe('personajesDe — sesiones nuevas', () => {
  it('usa la columna cuando trae personajes válidos', () => {
    const guardados = [p({ id: 'P1', rol: 'hijo' }), p({ id: 'P2', rol: 'padre' })]
    const r = personajesDe({ personajes: guardados, character_desc: 'ignorame' } as never)
    expect(r.map((x) => x.rol)).toEqual(['hijo', 'padre'])
  })

  it('recorta al tope de 4 — el prompt y el costo se dimensionan con ese número', () => {
    const seis = Array.from({ length: 6 }, (_, i) => p({ id: nuevoId(i), rol: `r${i}` }))
    expect(personajesDe({ personajes: seis } as never)).toHaveLength(MAX_PERSONAJES)
  })

  it('nuevoId numera desde 1 y el primero es el principal', () => {
    expect(nuevoId(0)).toBe(ID_PRINCIPAL)
    expect(nuevoId(3)).toBe('P4')
  })
})

/**
 * ⚠️ Misma lección que `resolveSlotId` en fill.ts: el modelo reescribe el identificador al
 * citarlo. Con búsqueda exacta la atribución se aplicaría a NADIE mientras el log dice
 * que sí — el modo de fallo más caro, el que se reporta como éxito.
 */
describe('resolvePersonaje', () => {
  const gente = [p({ id: 'P1', rol: 'hijo' }), p({ id: 'P2', rol: 'padre' })]

  it('resuelve el id exacto', () => {
    expect(resolvePersonaje(gente, 'P2')?.rol).toBe('padre')
  })

  it('tolera las formas que el modelo devuelve de verdad', () => {
    for (const ref of ['p2', ' P2 ', 'P2 (padre)', 'padre', 'El padre']) {
      expect(resolvePersonaje(gente, ref)?.rol).toBe('padre')
    }
  })

  it('lo que no resuelve devuelve null en vez de adivinar', () => {
    // Adivinar sería peor: le pondría la línea de uno a otro sin que nada lo reporte.
    expect(resolvePersonaje(gente, 'la señora')).toBeNull()
    expect(resolvePersonaje(gente, '')).toBeNull()
  })
})

describe('PersonajeSchema', () => {
  it('acepta un personaje completo', () => {
    expect(PersonajeSchema.safeParse(p({ voiceProfile: VOZ })).success).toBe(true)
  })

  it('rechaza uno sin los campos que la FASE 0 exige', () => {
    const { etnia, ...sinEtnia } = p()
    expect(PersonajeSchema.safeParse(sinEtnia).success).toBe(false)
  })
})

/**
 * El puente entre la atribución del forense (slice 2) y el render (slice 4). Empareja por
 * `tiempo` y NO por `n`, por el mismo motivo que `camaraDeLote`: `groupIntoLotes` renumera
 * después de `splitLongToma`.
 */
describe('hablantesPorTiempo', () => {
  const gente = [p({ id: 'P1', rol: 'hijo' }), p({ id: 'P2', rol: 'padre' })]

  it('resuelve el reparto de cada corte a personajes reales', () => {
    const mapa = hablantesPorTiempo([
      { tiempo: '00:00 - 00:05', hablantes: [{ personaje: 'P2' }] },
      { tiempo: '00:05 - 00:10', hablantes: [{ personaje: 'P1' }, { personaje: 'P2' }] },
    ], gente)
    expect(mapa.get('00:00 - 00:05')?.map((x) => x.rol)).toEqual(['padre'])
    expect(mapa.get('00:05 - 00:10')?.map((x) => x.rol)).toEqual(['hijo', 'padre'])
  })

  it('un corte SIN atribución no entra en el mapa', () => {
    // Quien consulta tiene que leer eso como "no se sabe", no como "no habla nadie" — es
    // el caso de toda sesión anterior al slice 2.
    const mapa = hablantesPorTiempo([{ tiempo: 'a' }, { tiempo: 'b', hablantes: [] }], gente)
    expect(mapa.size).toBe(0)
  })

  it('omite lo que no resuelve en vez de adivinar', () => {
    const mapa = hablantesPorTiempo([
      { tiempo: 'a', hablantes: [{ personaje: 'P1' }, { personaje: 'la señora' }] },
    ], gente)
    expect(mapa.get('a')?.map((x) => x.id)).toEqual(['P1'])
  })

  it('no repite un personaje que habla dos veces en el mismo corte', () => {
    const mapa = hablantesPorTiempo([
      { tiempo: 'a', hablantes: [{ personaje: 'P1' }, { personaje: 'hijo' }] },
    ], gente)
    expect(mapa.get('a')).toHaveLength(1)
  })

  it('sin cortes devuelve un mapa vacío en vez de romper', () => {
    expect(hablantesPorTiempo(undefined, gente).size).toBe(0)
  })
})

describe('etiqueta', () => {
  it('nombra al personaje por id y rol', () => {
    expect(etiqueta(p({ id: 'P2', rol: 'padre' }))).toBe('P2 (padre)')
  })
  it('sin rol útil se queda con el id', () => {
    expect(etiqueta(p({ id: 'P1', rol: 'P1' }))).toBe('P1')
  })
})
