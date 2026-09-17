import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { STEP, PASOS_PLANTILLA } from './steps'

const RAIZ = path.join(__dirname, '..', '..')
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), 'utf8')

describe('los pasos del flujo de plantilla', () => {
  it('son consecutivos desde 0 y coinciden con la cantidad de secciones', () => {
    const valores = Object.values(STEP)
    expect(valores).toEqual([0, 1, 2, 3, 4])
    expect(new Set(valores).size).toBe(PASOS_PLANTILLA)
  })

  /**
   * ⚠️ EL CONTRATO QUE ESTE ARCHIVO EXISTE PARA PROTEGER. El índice de cada sección en el array
   * `SECTIONS` de `TemplateWizard` TIENE que ser su `STEP`, porque el wizard renderiza
   * `SECTIONS[step]` y `step` es lo que las rutas escriben en la base.
   *
   * En video-ads esto se rompió de verdad: un recableado corrió una sección de índice y una ruta
   * se quedó escribiendo el viejo. Al reanudar, el wizard aterrizaba en una sección cuyo dato era
   * null y devolvía null — pantalla en blanco, sin ningún error. Se lee el archivo en vez de
   * importar el componente porque importarlo arrastra React y todo el árbol de secciones.
   */
  it('el orden de SECTIONS en el wizard coincide con STEP', () => {
    const src = leer('components/tools/generador-anuncios/TemplateWizard.tsx')
    const linea = src.match(/const SECTIONS = \[([^\]]+)\]/)
    expect(linea).not.toBeNull()
    const orden = linea![1].split(',').map((s) => s.trim())
    expect(orden).toEqual([
      'Section0Template',   // STEP.PLANTILLA
      'Section2Product',    // STEP.PRODUCTO
      'Section3Lote',       // STEP.LOTE
      'Section4Conceptos',  // STEP.CONCEPTOS
      'Section5Lote',       // STEP.ANUNCIOS
    ])
    expect(orden).toHaveLength(PASOS_PLANTILLA)
  })

  // Un índice escrito a mano es exactamente lo que esta constante vino a eliminar: si vuelve,
  // vuelve el bug.
  it.each([
    ['app/api/generador-anuncios/sessions/[id]/plantilla/route.ts', 'STEP.PRODUCTO'],
    ['app/api/generador-anuncios/sessions/[id]/plan-lote/route.ts', 'STEP.CONCEPTOS'],
    ['app/api/generador-anuncios/sessions/[id]/render-lote/route.ts', 'STEP.ANUNCIOS'],
  ])('%s escribe el paso con la constante, no con un número', (archivo, constante) => {
    const src = leer(archivo)
    expect(src).toContain(constante)
    expect(src).not.toMatch(/step:\s*\d/)
  })
})
