import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useVideoStore, SESSION_KEY } from './video'

/**
 * `ensureSession` y `resetSession` — las dos piezas del arreglo de SESIONES FANTASMA que
 * tienen lógica propia. El efecto de montaje del wizard es una rama de tres líneas que el
 * typecheck y la lectura cubren; lo que se puede romper en silencio es esto:
 *
 *  - `ensureSession` creando una fila cuando ya había una (una fila de más por paso), o
 *    no devolviendo el id (el bloqueo que demoró el arreglo original: `uploadDirect` firma
 *    la subida contra el id, así que sin valor de vuelta no hay dónde subir el video).
 *  - `resetSession` creando una fila al vaciar, que es exactamente el problema que este
 *    arreglo vino a eliminar entrando por la puerta de "Empezar".
 *
 * No hay jsdom en este proyecto (`environment: 'node'`), así que se stubean `localStorage`
 * Y `window`: el store guarda el id detrás de un `typeof window !== 'undefined'`, y sin ese
 * segundo stub la escritura se salta y el test mediría el camino del servidor.
 */
const almacen = new Map<string, string>()
beforeEach(() => {
  almacen.clear()
  vi.unstubAllGlobals()
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => almacen.get(k) ?? null,
    setItem: (k: string, v: string) => void almacen.set(k, v),
    removeItem: (k: string) => void almacen.delete(k),
  })
  useVideoStore.getState().resetSession()
})

describe('ensureSession', () => {
  it('devuelve el id que ya existe SIN pedirle una sesión al servidor', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    useVideoStore.setState({ sessionId: 'ya-existe' })

    expect(await useVideoStore.getState().ensureSession()).toBe('ya-existe')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // El valor de vuelta ES el contrato: `Section0Reference` sube el video contra ese id.
  it('crea la sesión y DEVUELVE el id cuando no hay ninguna', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ id: 'nueva' }) })))

    expect(await useVideoStore.getState().ensureSession()).toBe('nueva')
    expect(useVideoStore.getState().sessionId).toBe('nueva')
    expect(almacen.get(SESSION_KEY)).toBe('nueva')
  })

  // Sin id no se puede subir nada: el paso 0 tiene que poder decirlo en vez de subir
  // contra `undefined`.
  it('devuelve null y marca el error si el servidor falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))

    expect(await useVideoStore.getState().ensureSession()).toBeNull()
    expect(useVideoStore.getState().sessionError).toBe(true)
  })
})

describe('resetSession', () => {
  it('vacía el wizard sin crear ninguna fila', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    useVideoStore.setState({ sessionId: 'anterior', step: 6 })

    useVideoStore.getState().resetSession()

    expect(useVideoStore.getState().sessionId).toBeNull()
    expect(useVideoStore.getState().step).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
