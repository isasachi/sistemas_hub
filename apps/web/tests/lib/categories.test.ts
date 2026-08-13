import { describe, it, expect } from 'vitest'
import { CATEGORIES, categoryOf } from '@ph/shared'

// Lo que puede romperse acá es el ORDEN de las reglas y los límites de palabra,
// no el listado de sinónimos. Cada caso es un choque real entre dos categorías,
// tomado de los nichos que hoy tienen inventario.
describe('categoryOf — la primera regla que matchea gana', () => {
  const casos: [string, string][] = [
    ['cama para perros', 'mascotas'],        // "cama" también está en hogar
    ['cepillo para perro', 'mascotas'],      // "cepillo alisador" está en belleza
    ['bañera para bebe', 'bebes'],           // "baño" está en hogar
    ['leggings deportivos', 'fitness'],      // "leggings" está en moda
    ['zapatillas para correr', 'fitness'],   // "zapatillas" está en moda
    ['plantillas ortopedicas', 'ortopedia'],
    // Belleza corre antes que Salud, así que "uñas" gana a "hongos": el nicho
    // cae en cuidado de uñas y no en dolencias. "hongos en los pies" sí termina
    // en Salud (belleza no reclama "pies"). Los dos destinos son razonables —
    // se deja fijado cuál sale para que un reordenamiento no lo mueva sin querer.
    ['hongos en las uñas', 'belleza'],
    ['hongos en los pies', 'salud'],
    ['uñas en gel', 'belleza'],
    ['aceites esenciales', 'descanso'],      // "aceite corporal" está en belleza
    ['dolor de rodilla', 'salud'],
    ['gadgets cocina', 'cocina'],
    ['accesorios para auto', 'auto'],
    ['organización hogar', 'hogar'],         // con tilde: se normaliza
    ['tecnología', 'tecnologia'],
  ]
  for (const [niche, esperado] of casos) {
    it(`${niche} → ${esperado}`, () => expect(categoryOf(niche)).toBe(esperado))
  }

  // Los límites de palabra evitan el clásico falso positivo por substring.
  it('no clasifica por substring suelto', () => {
    expect(categoryOf('pierna')).toBe('salud')       // "pie" ⊄ "pierna"
    expect(categoryOf('dedo gatillo')).toBe('salud') // "gato" ⊄ "gatillo"
  })

  it('un nicho que no es de compra no fuerza categoría', () => {
    expect(categoryOf('hobbies nicho')).toBeNull()
  })

  it('todas las categorías tienen id único', () => {
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length)
  })
})
