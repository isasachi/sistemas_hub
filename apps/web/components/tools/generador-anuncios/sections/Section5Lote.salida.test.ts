import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, 'Section5Lote.tsx'), 'utf8')

/**
 * ⚠️ EMPEZAR DE NUEVO SON DOS MITADES, Y OMITIR UNA ES UN BUG YA PAGADO EN ESTE REPO.
 *
 * `resetSession` vacía el store; `localStorage.removeItem(SESSION_KEY)` borra el id guardado.
 * Con solo la primera, el `useEffect` de `TemplateWizard` relee el id al remontar y el usuario
 * vuelve a caer en la sesión que acaba de cerrar. Con solo la segunda, zustand es un singleton
 * de MÓDULO y sobrevive la navegación del cliente, así que el wizard se remonta con la sesión
 * anterior todavía en memoria — que es exactamente la regresión que documenta `resetSession`.
 *
 * Se lee el archivo como texto en vez de montar el componente porque importarlo arrastra
 * `next/image`, `next/link` y el store entero; el contrato que hay que fijar es de cableado, y
 * es el mismo criterio con el que `steps.test.ts` lee `TemplateWizard.tsx`.
 */
describe('la salida del flujo de plantilla', () => {
  it('“crear otro lote” borra el id guardado Y vacía el store', () => {
    const handler = SRC.match(/onClick=\{\(\) => \{([^}]*)\}\}/)
    expect(handler, 'no se encontró el onClick de crear otro lote').not.toBeNull()
    expect(handler![1]).toContain('localStorage.removeItem(SESSION_KEY)')
    expect(handler![1]).toContain('resetSession()')
  })

  // Crear la fila en el montaje fue el origen de las sesiones fantasma. El botón vacía y ya:
  // la sesión nueva nace cuando el usuario elige plantilla.
  it('no crea ninguna sesión por su cuenta', () => {
    expect(SRC).not.toMatch(/startNewSession|ensureSession/)
  })

  it('lleva al panel', () => {
    expect(SRC).toContain('href="/dashboard"')
  })

  // Salir a mitad del stream aborta el fetch: lo pagado queda persistido, pero las que faltan
  // se quedarían sin generar y sin avisar.
  it('las dos salidas se bloquean mientras el lote se está generando', () => {
    expect(SRC).toMatch(/disabled=\{corriendo\}/)
    expect(SRC).toMatch(/corriendo \? \(/)
  })
})
