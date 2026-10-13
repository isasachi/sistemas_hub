import { describe, it, expect, vi } from 'vitest'

// `agent.ts` importa el núcleo, que arrastra la base y lee prompts del disco: acá solo se prueban
// los candados puros.
vi.mock('./core', () => ({
  AnunciosError: class extends Error {},
  analyzeReference: vi.fn(), analyzeProduct: vi.fn(), generateCopy: vi.fn(), confirmCopy: vi.fn(),
  generateAd: vi.fn(), refineAd: vi.fn(), researchOf: vi.fn(),
}))
vi.mock('@/lib/ai-sdk', () => ({ chatModel: {} }))
vi.mock('@/lib/db', () => ({ getSession: vi.fn() }))
vi.mock('@/lib/storage', () => ({ fetchAsBase64: vi.fn() }))

import { isStorageUrl, pickedVersion, userAskedFor } from './agent'

// Los dos candados existen porque el modelo, medido, gastó créditos que nadie pidió. Lo que se fija
// acá es de qué lado fallan: ante la duda, NO se gasta.
describe('pickedVersion — el usuario tiene que haber elegido', () => {
  it.each([
    ['Me quedo con la versión B', 'B'],
    ['la A porfa', 'A'],
    ['B', 'B'],
    ['a.', 'A'],
    ['opción b, dale', 'B'],
    ['prefiero la segunda', 'B'],
    ['La primera está mejor', 'A'],
    ['Me quedo con la versión B\n[Adjunto imagen: a.jpg — https://x/a.jpg]', 'B'],
    // Las formas naturales de contestar: rechazarlas deja al usuario en un loop de "¿A o B?".
    ['Me quedo con B', 'B'],
    ['Elijo B', 'B'],
    ['Prefiero B', 'B'],
    ['B porfa', 'B'],
    ['B!!', 'B'],
    ['elijo b', 'B'],
    ['me quedo con la a', 'A'],
    ['A mí me gusta la B', 'B'],                 // la "A" inicial es la preposición
  ])('%s → %s', (texto, version) => expect(pickedVersion(texto)).toBe(version))

  it.each([
    '¿Cuál de las dos me recomiendas?',          // una pregunta no es una elección
    'voy a pensarlo',                            // "a" preposición
    'no sé si la A o la B',                      // nombra las dos
    'hazlas más cortas',
    'la abuela dice que sí',                     // "la a…" dentro de una palabra
    'A ver, ¿cuál es mejor?',                    // preposición a principio de frase
    'quiero algo más corto',
    '',
  ])('%s → null', (texto) => expect(pickedVersion(texto)).toBeNull())
})

describe('userAskedFor — el cambio tiene que estar en el mensaje', () => {
  it('acepta el pedido en las palabras del usuario, aunque el modelo lo reformule un poco', () => {
    expect(userAskedFor('Haz el fondo un poco más claro.', 'Ponle el fondo un poco más claro')).toBe(true)
    expect(userAskedFor('titular más grande', 'quiero el titular mas grande y el logo arriba')).toBe(true)
  })

  // El candado rechaza el pedido VIEJO, no la paráfrasis: negarse a un cambio que el usuario sí
  // pidió es el fallo de "dije que lo hacía y no lo hice" por otra puerta.
  it('acepta una paráfrasis que no calza con el mensaje, si tampoco calza con uno anterior', () => {
    expect(userAskedFor('Aumentar el tamaño del texto', 'el texto se ve muy chico', ['Ponle el fondo un poco más claro'])).toBe(true)
  })

  it('rechaza el pedido que calza con un mensaje ANTERIOR y no con el actual', () => {
    expect(userAskedFor('Haz el fondo más claro', 'Gracias, me encanta cómo quedó', ['Ponle el fondo un poco más claro'])).toBe(false)
  })

  it('un regenerar sin texto vale solo si el mensaje pide otra versión', () => {
    expect(userAskedFor('', 'hazme otra versión')).toBe(true)
    expect(userAskedFor('', 'regenéralo')).toBe(true)
    expect(userAskedFor('', 'gracias!')).toBe(false)
  })
})

describe('isStorageUrl', () => {
  it('solo el bucket propio', () => {
    vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co')
    expect(isStorageUrl('https://abc.supabase.co/storage/v1/object/public/ad-uploads/s/chat-1.png')).toBe(true)
    expect(isStorageUrl('https://evil.example/a.png')).toBe(false)
    expect(isStorageUrl('no es una url')).toBe(false)
    vi.unstubAllEnvs()
  })
})
