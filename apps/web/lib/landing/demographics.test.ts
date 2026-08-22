import { describe, it, expect } from 'vitest'
import { DemographicId, BodyFocus, NicheId, type SectionType } from './types'
import {
  DEMOGRAPHIC_POSES, DEMOGRAPHIC_PERSONA, assignPoses,
  ZONE_POSES, BODY_FOCUS_LABELS, BODY_FOCUS_FRAMING, zoneNeedsOwnPlate,
  personaFor, NICHE_WARDROBE, BODY_FOCUS_ZONAS, SIN_ZONA,
} from './demographics'
import { NICHE_LABELS, NICHE_FALLBACK, NICHE_DEFAULT_DEMOGRAPHIC } from './niches'

describe('Anexo B — poses y persona', () => {
  it('cada demografía con talento tiene ≥8 poses únicas; no_talent = 0', () => {
    for (const d of DemographicId.options) {
      const poses = DEMOGRAPHIC_POSES[d]
      if (d === 'no_talent') { expect(poses).toEqual([]); continue }
      expect(poses.length, d).toBeGreaterThanOrEqual(8)
      expect(new Set(poses).size, d).toBe(poses.length) // sin repetición
      expect(DEMOGRAPHIC_PERSONA[d], d).toBeTruthy()
    }
  })
  it('assignPoses da una pose ÚNICA por sección, determinista', () => {
    const order = ['hero', 'beneficios', 'oferta', 'testimonios', 'garantia', 'cta-final'] as const
    const a = assignPoses([...order], 'female_18_30')
    const b = assignPoses([...order], 'female_18_30')
    expect(a).toEqual(b) // determinista
    const vals = Object.values(a)
    expect(new Set(vals).size).toBe(vals.length) // únicas (QA#6)
    expect(a['cta-final']).toContain('envase') // pose reservada sosteniendo el producto
  })
  it('no_talent devuelve poses vacías (el carril usa el sustituto por nicho)', () => {
    expect(assignPoses(['hero'], 'no_talent')).toEqual({ hero: '' })
  })
})

// ─── Zona del cuerpo (2026-08-15) ───────────────────────────────────────────
// El bug que esto arregla: las poses salían SOLO de la demografía, y los seis bancos están
// encuadrados en el rostro. Una rodillera recibía un retrato; una creatina de glúteos, también.
describe('assignPoses con body_focus', () => {
  const ORDEN: SectionType[] = ['hero', 'beneficios', 'oferta', 'antes-despues']

  it('sin zona (o con rostro/cabello) sale IDÉNTICO a antes — todo del banco demográfico', () => {
    const base = assignPoses(ORDEN, 'female_18_30')
    expect(assignPoses(ORDEN, 'female_18_30', null)).toEqual(base)
    expect(assignPoses(ORDEN, 'female_18_30', 'rostro')).toEqual(base)
    expect(assignPoses(ORDEN, 'female_18_30', 'cabello')).toEqual(base)
    for (const pose of Object.values(base)) {
      expect(DEMOGRAPHIC_POSES.female_18_30).toContain(pose)
    }
  })

  // La regla del reparto: la cara abre la landing, la zona la sostiene.
  it('el hero conserva la pose demográfica y el resto toma la de la zona', () => {
    const p = assignPoses(ORDEN, 'female_18_30', 'gluteos_piernas')
    expect(DEMOGRAPHIC_POSES.female_18_30).toContain(p.hero)
    for (const s of ['beneficios', 'oferta', 'antes-despues'] as SectionType[]) {
      expect(ZONE_POSES.gluteos_piernas).toContain(p[s])
      expect(DEMOGRAPHIC_POSES.female_18_30).not.toContain(p[s])
    }
  })

  it('ninguna sección de zona repite pose mientras el banco alcance (QA#6)', () => {
    const p = assignPoses(ORDEN, 'female_18_30', 'rodilla')
    const zonales = (['beneficios', 'oferta', 'antes-despues'] as SectionType[]).map((s) => p[s])
    expect(new Set(zonales).size).toBe(zonales.length)
  })

  // El banco de zona es de ENCUADRE: si una pose nombrara la cara, el producto se vería en una
  // sección y la cara en la otra, que es exactamente el defecto original.
  it('ninguna pose de zona (fuera de cuerpo_completo) menciona el rostro', () => {
    for (const [zona, poses] of Object.entries(ZONE_POSES)) {
      if (zona === 'cuerpo_completo') continue
      for (const pose of poses) {
        expect(pose.toLowerCase()).not.toMatch(/\bsonrisa|mirada a cámara|mejilla|mentón\b/)
      }
    }
  })

  it('la demografía sin talento sigue devolviendo poses vacías, con zona o sin ella', () => {
    expect(assignPoses(ORDEN, 'no_talent', 'rodilla')).toEqual({
      hero: '', beneficios: '', oferta: '', 'antes-despues': '',
    })
  })

  it('zoneNeedsOwnPlate: solo las zonas con banco propio piden una segunda placa', () => {
    expect(zoneNeedsOwnPlate('rostro')).toBe(false)
    expect(zoneNeedsOwnPlate('cabello')).toBe(false)
    expect(zoneNeedsOwnPlate(null)).toBe(false)
    expect(zoneNeedsOwnPlate('rodilla')).toBe(true)
    expect(zoneNeedsOwnPlate('gluteos_piernas')).toBe(true)
  })

  it('cada zona tiene etiqueta de UI y texto de encuadre — el selector y la placa los leen', () => {
    for (const f of BodyFocus.options) {
      expect(BODY_FOCUS_LABELS[f]).toBeTruthy()
      expect(BODY_FOCUS_FRAMING[f]).toBeTruthy()
    }
  })
})

// ─── Vestuario por nicho + zona (2026-08-15) ────────────────────────────────
// El bug: la ropa vivía incrustada en `DEMOGRAPHIC_PERSONA` y era ciega al producto. Una
// `female_18_30` iba con "camiseta blanca de tirantes" para un sérum y para una creatina de
// glúteos, y el modelo completaba lo que faltaba abajo — en un caso real, un short de jean sobre
// un producto cuya promesa ES el tren inferior.
describe('personaFor — vestuario del nicho y de la zona', () => {
  it('el caso reportado: creatina de glúteos viste licra, nunca jean', () => {
    const p = personaFor('female_18_30', 'fitness_weightloss', 'gluteos_piernas')
    expect(p).toContain('licra')
    expect(p).toContain('nunca jean')
  })

  // La ropa NO es un rasgo de la persona: el mismo cuerpo con otro producto se viste distinto.
  it('la misma demografía cambia de vestuario según el nicho', () => {
    const fitness = personaFor('female_18_30', 'fitness_weightloss', 'rostro')
    const skincare = personaFor('female_18_30', 'skincare_topical', 'rostro')
    expect(fitness).not.toBe(skincare)
    expect(fitness).toContain('deportiva')
    expect(skincare).toContain('skincare')
    // los rasgos sí se conservan: es la misma persona, otra ropa
    expect(fitness).toContain('Mujer peruana de 18-30 años')
    expect(skincare).toContain('Mujer peruana de 18-30 años')
  })

  // Sin esto una rodillera sale con pantalón largo y la rodilla tapada: el mismo fallo que el jean.
  it('la zona impone que la prenda DEJE VER la parte que el producto cambia', () => {
    expect(personaFor('senior_55_plus', 'joint_mobility', 'rodilla')).toContain('nunca pantalón largo')
    expect(personaFor('female_30_45', 'fitness_weightloss', 'abdomen')).toContain('abdomen y la cintura a la vista')
  })

  it('las zonas sin restricción propia (rostro/cabello) solo llevan el vestuario del nicho', () => {
    const conZona = personaFor('female_18_30', 'skincare_topical', 'rostro')
    const sinZona = personaFor('female_18_30', 'skincare_topical', null)
    expect(conZona).toBe(sinZona)
  })

  it('ninguna persona menciona ya una prenda fija de demografía', () => {
    for (const d of DemographicId.options) {
      if (d === 'no_talent') continue
      expect(DEMOGRAPHIC_PERSONA[d]).not.toMatch(/camiseta|blusa|camisa|ropa cómoda/)
    }
  })

  it('no_talent no arma persona: el carril lo llena el sustituto del nicho', () => {
    expect(personaFor('no_talent', 'pets', 'rostro')).toBe('')
  })

  it('cada nicho tiene vestuario — un nicho sin entrada dejaría "viste undefined" en el prompt', () => {
    for (const n of NicheId.options) expect(NICHE_WARDROBE[n]).toBeTruthy()
  })
})


// `cuerpo_completo` = ausencia de zona, no una zona: sin banco de poses no se genera placa propia y
// la sección vuelve al retrato canónico de medio cuerpo (comportamiento previo al eje de zona).
describe('cuerpo_completo no es una zona', () => {
  it('no pide placa propia', () => {
    expect(zoneNeedsOwnPlate('cuerpo_completo')).toBe(false)
  })
  it('las zonas reales sí la piden', () => {
    expect(zoneNeedsOwnPlate('gluteos_piernas')).toBe(true)
    expect(zoneNeedsOwnPlate('rodilla')).toBe(true)
  })
  it('su encuadre no nombra el cuerpo entero', () => {
    expect(BODY_FOCUS_FRAMING.cuerpo_completo).not.toMatch(/cuerpo entero|cabeza a pies/i)
  })
})


// ─── Talento contextual (2026-08-21) ────────────────────────────────────────
describe('poses contextuales y complexión', () => {
  const ORDEN: SectionType[] = ['hero', 'oferta', 'antes-despues', 'beneficios']
  const CTX = ['Sentada en la cama al despertar, estirando los brazos', 'Recostada de lado sobre la almohada, ojos cerrados', 'Sirviéndose agua en la mesa de noche', 'Leyendo en el sillón antes de dormir']

  // La garantía que importa: sin visión, TODO sale idéntico a antes de este eje.
  it('sin poses contextuales el reparto es EXACTAMENTE el de siempre', () => {
    for (const focus of ['cuerpo_completo', 'gluteos_piernas', 'rostro'] as const) {
      expect(assignPoses(ORDEN, 'female_30_45', focus, undefined))
        .toEqual(assignPoses(ORDEN, 'female_30_45', focus))
      expect(assignPoses(ORDEN, 'female_30_45', focus, [])).toEqual(assignPoses(ORDEN, 'female_30_45', focus))
    }
    expect(personaFor('female_30_45', 'generic', 'rostro', undefined))
      .toBe(personaFor('female_30_45', 'generic', 'rostro'))
  })

  it('sin zona real, las poses contextuales entran en TODAS las secciones', () => {
    const out = assignPoses(ORDEN, 'female_30_45', 'cuerpo_completo', CTX)
    // Cada sección recibe UNA del set contextual, MENOS `antes-despues`: ahí manda su propia nota
    // de encuadre (ver el test de contradicción en instructions.test.ts).
    const contextuales = ORDEN.filter((s) => s !== 'antes-despues')
    for (const s of contextuales) expect(CTX.some((c) => out[s].startsWith(c))).toBe(true)
    expect(DEMOGRAPHIC_POSES.female_30_45).toContain(out['antes-despues'])
    expect(new Set(ORDEN.map((s) => out[s])).size).toBe(4) // 4 secciones, 4 poses distintas
  })

  // El guard que impide que el maniquí vuelva por la puerta nueva.
  it('el techo de encuadre se aplica AUNQUE no haya zona real', () => {
    const out = assignPoses(ORDEN, 'female_30_45', 'cuerpo_completo', ['De pie de cuerpo entero, brazos sueltos'])
    expect(out.hero).toContain('el plano NUNCA se abre más que eso')
    expect(out.hero).toContain('medio cuerpo')
  })

  it('con zona real el hero conserva su pose demográfica y la zona recibe lo contextual', () => {
    const out = assignPoses(ORDEN, 'female_30_45', 'rodilla', CTX)
    expect(out.hero).toBe(DEMOGRAPHIC_POSES.female_30_45[0])
    expect(out.beneficios).toContain('SIN el rostro en cuadro')
  })

  it('no_talent no recibe poses aunque lleguen contextuales', () => {
    const out = assignPoses(ORDEN, 'no_talent', 'cuerpo_completo', CTX)
    for (const s of ORDEN) expect(out[s]).toBe('')
  })

  it('la complexión entra en la persona sin desplazar rasgos ni vestuario', () => {
    const p = personaFor('female_30_45', 'fitness_weightloss', null, 'atlética, hombros definidos')
    expect(p).toContain('complexión atlética, hombros definidos')
    expect(p).toContain('Mujer peruana de 30-45')
    expect(p).toContain('viste ')
  })

  it('la complexión se redacta sin costuras venga como adjetivo o como sustantivo', () => {
    // Medido: el modelo devuelve la complexión capitalizada y con punto, y a veces repitiendo la
    // palabra. Sin normalizar salía "complexión Complexión atlética, …., viste …".
    expect(personaFor('female_30_45', 'generic', null, 'Complexión atlética, con piernas tonificadas.'))
      .toContain('complexión atlética, con piernas tonificadas, viste')
    expect(personaFor('female_30_45', 'generic', null, 'Cuerpo entrenado con glúteos definidos'))
      .toContain('cuerpo entrenado con glúteos definidos, viste')
    expect(personaFor('female_30_45', 'generic', null, 'sana y equilibrada'))
      .toContain('complexión sana y equilibrada, viste')
  })
})

describe('el selector no ofrece cuerpo entero', () => {
  it('las zonas ofrecidas excluyen el marcador de "sin zona"', () => {
    expect(BODY_FOCUS_ZONAS).not.toContain(SIN_ZONA)
    expect(BODY_FOCUS_ZONAS.length).toBe(BodyFocus.options.length - 1)
  })
  it('ninguna etiqueta ofrecida nombra el cuerpo entero', () => {
    for (const f of [SIN_ZONA, ...BODY_FOCUS_ZONAS]) {
      expect(BODY_FOCUS_LABELS[f]).not.toMatch(/cuerpo (completo|entero)/i)
    }
  })
  it('sin zona sigue siendo un valor válido del enum (es el marcador persistido)', () => {
    expect(BodyFocus.options).toContain(SIN_ZONA)
    expect(zoneNeedsOwnPlate(SIN_ZONA)).toBe(false)
  })
})

describe('suplemento femenino es un nicho aparte', () => {
  it('convive con el de belleza y el masculino, con etiqueta propia', () => {
    expect(NICHE_LABELS.supplement_female).toBe('Suplemento femenino')
    expect(NICHE_LABELS.supplement_skin_female).not.toBe(NICHE_LABELS.supplement_female)
    expect(NICHE_LABELS.supplement_male_performance).toBe('Suplemento masculino')
  })
  it('tiene su propia identidad visual y vestuario, no los hereda de belleza', () => {
    expect(NICHE_FALLBACK.supplement_female.hue).not.toBe(NICHE_FALLBACK.supplement_skin_female.hue)
    expect(NICHE_WARDROBE.supplement_female).not.toBe(NICHE_WARDROBE.supplement_skin_female)
    expect(NICHE_DEFAULT_DEMOGRAPHIC.supplement_female).toBe('female_30_45')
  })
})
