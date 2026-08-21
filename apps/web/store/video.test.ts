/**
 * Hidratación del wizard de video: lo que se reanuda tiene que ser lo que se guardó.
 *
 * El caso que esto fija costaba dinero. `hydrateFromSession` armaba `inputs` campo por
 * campo y se olvidaba de `personajes`; al reanudar, `Section2Character` caía a su
 * fallback de UNO y `POST /inputs` (que mapea sobre lo que le manda el wizard, porque
 * es donde se borra un personaje) dejaba la fila con uno solo. Con los otros se iban
 * sus avatares ya generados con Nano Banana Pro.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { useVideoStore } from './video'
import type { VideoSessionResponse } from '@/lib/video-ads/types'

const base = {
  id: 's1', step: 2, reference_video_url: null, forensic_analysis: null,
  product_url: null, product_scan: null, character_url: null,
  product_name: 'Serum', what_it_does: null, angle: null, target_audience: null,
  problem: null, character_desc: null, character_ethnicity: null, accent: null,
  voice: null, constraints: null, validation: null, template: null, adapted: null,
  consistency_block: null, personajes: null,
} as unknown as VideoSessionResponse

const hidratar = (s: Partial<VideoSessionResponse>) =>
  useVideoStore.getState().hydrateFromSession({ ...base, ...s } as VideoSessionResponse)

beforeEach(() => {
  useVideoStore.setState({ inputs: { ...useVideoStore.getState().inputs, personajes: undefined } })
})

describe('hydrateFromSession — personajes', () => {
  it('repuebla la lista completa, con lo que FASE 4 ya generó', () => {
    const guardados = [
      { id: 'p1', rol: 'hijo', desc: 'joven', etnia: 'mexicano', acento: 'mexicano de ciudad',
        voz: 'media', fotoUrl: null, avatarUrl: 'https://x/avatar-1.png' },
      { id: 'p2', rol: 'padre', desc: 'mayor', etnia: 'mexicano', acento: 'mexicano rural',
        voz: 'grave', fotoUrl: null, avatarUrl: 'https://x/avatar-2.png' },
    ]
    hidratar({ personajes: guardados as never })
    const p = useVideoStore.getState().inputs.personajes
    expect(p).toHaveLength(2)
    // El avatar es lo caro: si no sobrevive la hidratación, el siguiente guardado lo tira.
    expect(p?.map((x) => x.id)).toEqual(['p1', 'p2'])
  })

  it('una sesión LEGADA deja la lista sin definir, no en []', () => {
    // La diferencia importa: `Section2Character` usa `inputs.personajes?.length` para
    // decidir si arma su personaje único desde las columnas singulares. Un array vacío
    // es falsy en `.length`, pero escribir [] acá haría que una sesión de un personaje
    // empezara a persistir la columna `personajes` solo por haberla abierto — y el
    // camino legado (columnas singulares) es justo el que no debe activarse solo.
    hidratar({ personajes: null })
    expect(useVideoStore.getState().inputs.personajes).toBeUndefined()
  })
})
