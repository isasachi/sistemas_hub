import { describe, it, expect } from 'vitest'
import { juzgarAnunciante, type Medicion } from './scan-verify'

const medicion = (extra: Partial<Medicion> = {}): Medicion => ({
  // adCount es el del PAÍS (define el rango); adCountGlobal, el de todos los
  // mercados. Se separan desde que medir en global inflaba el rango.
  adCount: 44, adCountGlobal: 44,
  share: 0.96, dominante: 'temu.com/organizador', distintos: 2,
  muestra: 25, senal: 'ninguna', masViejo: null,
  textos: ['Organizador de closet plegable — Envío gratis a todo el país'],
  ...extra,
})

// `ai` en null probaría el camino sin LLM, así que se pasa un doble que FALLA si
// lo llaman: el punto de estos tests es que ni siquiera se llegue al modelo.
const aiQueNoDebeUsarse = {
  messages: { create: () => { throw new Error('no se debía llamar al modelo') } },
} as never

describe('juzgarAnunciante — el share se resuelve sin modelo', () => {
  it('descarta por share bajo sin consultar a Haiku', async () => {
    const v = await juzgarAnunciante(aiQueNoDebeUsarse, 'acne', 'Tienda X', medicion({ share: 0.2, distintos: 9 }))
    expect(v.status).toBe('descartado')
    expect(v.nota).toContain('no es monoproducto')
  })
})

describe('juzgarAnunciante — lista negra antes del modelo', () => {
  // El fallo real: con 44 anuncios y 96% del mismo organizador, el modelo
  // aprobó Temu Argentina como monoproducto del nicho "organización hogar".
  it('descarta un marketplace aunque su share sea altísimo', async () => {
    const v = await juzgarAnunciante(aiQueNoDebeUsarse, 'organizacion hogar', 'Temu Argentina', medicion())
    expect(v.status).toBe('descartado')
    expect(v.kind).toBe('servicio')
    expect(v.nota).toContain('marketplace')
  })

  it('también corta clínicas sin gastar llamada', async () => {
    // ⚠️ Sin "envío gratis" en el texto: `physical-filter` trata las señales de
    // envío como override y deja pasar a la clínica a propósito (el error caro
    // es descartar un producto real). Meter esa frase acá probaría otra cosa.
    const clinica = await juzgarAnunciante(aiQueNoDebeUsarse, 'acne', 'Clinica Dermatologica Lima', medicion({
      textos: ['Tratamiento facial con laser para el acne. Agenda tu cita.'],
    }))
    expect(clinica.status).toBe('descartado')
    expect(clinica.nota).toContain('clinica')
  })

  it('un anunciante normal SÍ llega al modelo', async () => {
    // Si la lista negra lo dejara pasar mal, este test fallaría con el error del
    // doble; que falle por ahí es justamente la señal de que no se descartó.
    await expect(
      juzgarAnunciante(aiQueNoDebeUsarse, 'acne', 'Dermixa Chile', medicion({ dominante: 'dermixachile.com/products/bacne-outbar' })),
    ).rejects.toThrow('no se debía llamar al modelo')
  })
})
