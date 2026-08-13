import { describe, it, expect } from 'vitest'
import { buildForensicInstruction, ForensicReportSchema } from './forensic'

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

  it('prohíbe inferir etnia y acento', () => {
    expect(p).toMatch(/nunca infieras|no infieras/i)
    expect(p).toMatch(/raza|etnia/i)
    expect(p).toMatch(/acento/i)
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
