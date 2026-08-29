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

  // ── Cobertura agregada el 2026-08-29 ──────────────────────────────────────
  // Medido contra el inventario real: 42 nichos con 6.694 productos (8,6%) no
  // matcheaban ninguna regla, y no eran basura — creatina, magnesio, keratina,
  // pilates, papada, túnel carpiano. Tras estas reglas queda 0,9%, que son los
  // cuatro nichos que de verdad no son de compra.
  const nuevos: Array<[string, string]> = [
    ['creatina', 'suplementos'], ['magnesio', 'suplementos'], ['melatonina', 'suplementos'],
    ['multivitaminico', 'suplementos'], ['probioticos', 'suplementos'], ['ashwagandha', 'suplementos'],
    ['keratina', 'belleza'], ['puntas abiertas', 'belleza'], ['niacinamida', 'belleza'],
    ['puntos negros', 'belleza'], ['retinol', 'belleza'], ['papada', 'belleza'],
    ['boxeo', 'fitness'], ['pilates', 'fitness'], ['estiramiento', 'fitness'],
    ['rueda abdominal', 'fitness'], ['recuperacion muscular', 'fitness'],
    ['tunel carpiano', 'ortopedia'], ['manguito rotador', 'ortopedia'],
    ['menisco', 'ortopedia'], ['torticolis', 'ortopedia'], ['venda elastica', 'ortopedia'],
    ['humidificador', 'hogar'], ['cojines', 'hogar'], ['tira led', 'tecnologia'],
    ['fundas de asiento', 'auto'], ['inflador de llantas', 'auto'],
    ['collar', 'moda'],
    ['estreñimiento', 'salud'], ['sofocos', 'salud'], ['fibromialgia', 'salud'],
    ['vista cansada', 'salud'], ['sinusitis', 'salud'], ['hipotiroidismo', 'salud'],
  ]
  for (const [niche, esperado] of nuevos) {
    it(`${niche} → ${esperado}`, () => expect(categoryOf(niche)).toBe(esperado))
  }

  // ⚠️ Ensanchar una regla puede robarle nichos a otra categoría, y el orden es
  // lo único que lo evita. Estos son los cruces que las reglas nuevas tocan.
  it('las reglas nuevas no le roban a la categoría que iba primero', () => {
    expect(categoryOf('collarin cervical')).toBe('ortopedia')   // antes que moda
    expect(categoryOf('collar para perros')).toBe('mascotas')   // antes que moda
    expect(categoryOf('dolor abdominal')).toBe('salud')         // "abdominal" no lo lleva a fitness
    expect(categoryOf('cojin para coxis')).toBe('ortopedia')    // antes que hogar
    expect(categoryOf('tiroides')).toBe('salud')                // el recorte a "tiroid" no lo pierde
    expect(categoryOf('vitamina c')).toBe('suplementos')        // el recorte a "vitamin" tampoco
  })

  it('todas las categorías tienen id único', () => {
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length)
  })
})
