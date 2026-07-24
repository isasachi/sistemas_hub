import type { DemographicId, NicheId, SectionType } from './types'

// Nombre legible (UI) por demografía — paso 0.a Paso 2 del wizard (selector siempre editable).
export const DEMOGRAPHIC_LABELS: Record<DemographicId, string> = {
  female_18_30: 'Mujer 18-30',
  female_30_45: 'Mujer 30-45',
  female_45_plus: 'Mujer 45+',
  male_20_35: 'Hombre 20-35',
  male_35_55: 'Hombre 35-55',
  senior_55_plus: 'Adulto mayor 55+',
  no_talent: 'Sin persona / solo producto',
}

// ─── Anexo B — banco de poses por demografía ────────────────────────────────
// El spec (Anexo B.1–B.6) da 6 poses por banco; acá se autorea hasta ≥8 por demografía
// manteniendo el estilo (mano/mirada/encuadre) y la regla transversal: nunca dolor explícito,
// nunca sufrimiento actuado. Las poses del spec se mantienen VERBATIM; las nuevas van marcadas
// con el comentario `// autoreada` (no forma parte del string — es un prompt de generación de
// imagen, no debe llevar notas editoriales). La ÚLTIMA pose de cada banco es la reservada para `cta-final`:
// "sosteniendo el envase … mirada a cámara" — así `assignPoses` la toma siempre para esa sección.
export const DEMOGRAPHIC_POSES: Record<DemographicId, string[]> = {
  // B.1 — belleza, piel, capilar
  female_18_30: [
    'Mano en la mejilla, mirada elevada en 3/4, sonrisa contenida',
    'Ambas manos enmarcando el rostro, mirada directa a cámara',
    'Perfil 3/4, yemas rozando la mandíbula, ojos cerrados',
    'Cabeza inclinada al hombro, mano en el cuello, sonrisa abierta',
    'Mentón apoyado en el dorso de la mano, mirada a cámara',
    'Giro sobre el hombro hacia cámara, espalda parcialmente de frente',
    'Recogiendo el cabello detrás de la oreja, mirada baja',
    'Mano rozando la clavícula, hombro elevado, media sonrisa', // autoreada
    'Sosteniendo el envase a la altura del pecho, mirada a cámara',
  ],
  // B.2 — antiedad, bienestar, energía, maternidad
  female_30_45: [
    'Brazos cruzados relajados, mirada a cámara, sonrisa segura',
    'Mano sobre la clavícula, cabeza ligeramente inclinada',
    '3/4 mirando fuera de cuadro hacia la luz, expresión serena',
    'Sentada, codo apoyado, mentón sobre el puño cerrado',
    'Riendo con la cabeza levemente atrás, mano en el pecho',
    'De pie junto a una ventana, brazos sueltos, mirada al frente', // autoreada
    'Mano en la cintura, torso girado 3/4, sonrisa suave', // autoreada
    'Ambas manos sosteniendo el envase a la altura del abdomen',
  ],
  // B.3 — articulaciones, menopausia, movilidad
  female_45_plus: [
    'Sentada erguida, manos sobre el regazo, sonrisa amable a cámara',
    'De pie, manos en la cintura, postura abierta',
    '3/4, mano sobre el hombro contrario, expresión de alivio',
    'Caminando de perfil, brazos en movimiento natural',
    'Mano apoyada en una superficie, mirada a cámara',
    'Brazo estirado sobre la cabeza, movimiento fluido y sin esfuerzo',
    'De pie junto a la ventana, respirando hondo, mirada serena', // autoreada
    'Sosteniendo el envase con ambas manos a la altura del pecho, mirada a cámara',
  ],
  // B.4 — fitness, rendimiento, definición
  male_20_35: [
    'Torso en 3/4, brazos cruzados, mirada firme a cámara',
    'Mano en la nuca, codo elevado, mirada al frente',
    'Perfil, tensión visible en hombro y antebrazo, mirada baja',
    'Ambas manos en la cintura, hombros abiertos, mentón alto',
    'Girando el hombro hacia cámara, media sonrisa',
    'De pie, brazos relajados a los costados, mirada directa', // autoreada
    'Estiramiento de cuello, mano en el hombro contrario, mirada al frente', // autoreada
    'Sosteniendo el envase a la altura del pecho, agarre firme',
  ],
  // B.5 — energía, testosterona, vitalidad
  male_35_55: [
    'Brazos cruzados, mirada a cámara, autoridad tranquila',
    'Mano en el mentón, mirada en 3/4 fuera de cuadro',
    'De pie, una mano en el bolsillo, hombros relajados',
    'Sentado, codos sobre las rodillas, manos entrelazadas',
    'Riendo con la cabeza ligeramente girada',
    'Mano en la nuca, torso 3/4, expresión confiada', // autoreada
    'De pie junto a una superficie, apoyo ligero de la mano, mirada al frente', // autoreada
    'Sosteniendo el envase a media altura, mirada a cámara',
  ],
  // B.6 — mixto
  senior_55_plus: [
    'Sentado, manos entrelazadas, sonrisa cálida a cámara',
    'De pie apoyado en una baranda, postura estable',
    'Caminando de perfil, paso ligero',
    'Mano sobre la rodilla o el hombro, expresión de alivio',
    'Manos abiertas hacia cámara, gesto de apertura',
    'Sentado junto a la ventana, mirada serena hacia la luz', // autoreada
    'De pie, manos entrelazadas al frente, sonrisa tranquila', // autoreada
    'Ambas manos sosteniendo el envase, mirada a cámara',
  ],
  // B.7 — sin talento: el carril lo llena el sustituto por nicho, no un banco de poses.
  no_talent: [],
}

// Plantilla base de persona por demografía (Anexo B, reglas transversales: rasgos coherentes
// con {{locale}} — es-PE aquí — piel real con textura natural, sin idealizar). Se concreta con
// más detalle de locale/rasgos en la extracción (`model_persona` se escribe una vez y se repite
// literal en las 8 secciones: mismo rostro, mismo peinado, misma ropa, mismos accesorios).
export const DEMOGRAPHIC_PERSONA: Record<DemographicId, string> = {
  female_18_30: 'Mujer peruana de 18-30 años, piel real con textura natural, cabello recogido, camiseta blanca de tirantes, aretes dorados discretos, expresión serena y segura',
  female_30_45: 'Mujer peruana de 30-45 años, piel real con textura natural, cabello suelto con ondas suaves, blusa neutra sencilla, sin joyería llamativa, expresión cálida y confiada',
  female_45_plus: 'Mujer peruana de 45 años o más, piel real con textura natural, canas visibles o cabello entrecano, ropa cómoda y neutra, expresión de bienestar y alivio sereno',
  male_20_35: 'Hombre peruano de 20-35 años, piel real con textura natural, cabello corto prolijo, camiseta deportiva ajustada de color neutro, expresión de confianza física',
  male_35_55: 'Hombre peruano de 35-55 años, piel real con textura natural, barba corta prolija, camisa casual de color neutro, expresión de autoridad tranquila',
  senior_55_plus: 'Persona peruana mayor de 55 años, piel real con textura natural, cabello canoso, ropa cómoda y neutra, expresión cálida y estable',
  no_talent: '',
}

// Anexo B.7 — sustituto del carril de talento cuando `demographic_id` es `no_talent`. Cinco
// filas explícitas en el spec; el resto de nichos usa el fallback genérico "Producto en
// contexto, a escala humana" (mismas reglas de carril/sangrado/talent_anchor).
const GENERIC_SUBSTITUTE = 'Producto en contexto, a escala humana'

export const NO_TALENT_SUBSTITUTE: Record<NicheId, string> = {
  supplement_skin_female: GENERIC_SUBSTITUTE,
  skincare_topical: GENERIC_SUBSTITUTE,
  haircare: GENERIC_SUBSTITUTE,
  fitness_weightloss: GENERIC_SUBSTITUTE,
  supplement_male_performance: GENERIC_SUBSTITUTE,
  joint_mobility: GENERIC_SUBSTITUTE,
  intimate_wellness: GENERIC_SUBSTITUTE,
  herbal_natural: GENERIC_SUBSTITUTE,
  baby_maternity: GENERIC_SUBSTITUTE,
  pets: 'El animal como protagonista, con banco de poses propio',
  home_cleaning: 'Mano y antebrazo en acción sobre la superficie, sin rostro',
  tech_gadgets: 'El dispositivo en uso, en contexto real, a escala humana',
  kitchen_tools: 'Manos manipulando el ingrediente, sin rostro',
  jewelry_fashion: GENERIC_SUBSTITUTE,
  automotive: 'Detalle del vehículo o mano con la herramienta',
  generic: GENERIC_SUBSTITUTE,
}

// Asignación determinista pose↔sección (QA#6: pose única por sección, sin repetir). Recorre
// `order`; `cta-final` SIEMPRE recibe la pose reservada (última del banco). El resto toma poses
// del pool restante en orden, ciclando si `order` tiene más secciones que poses disponibles.
// Banco vacío (`no_talent`) → toda sección mapea a cadena vacía (el carril lo llena el
// sustituto de Anexo B.7, resuelto por nicho fuera de esta función).
export function assignPoses(order: SectionType[], demographic: DemographicId): Record<string, string> {
  const bank = DEMOGRAPHIC_POSES[demographic]
  const out: Record<string, string> = {}
  if (bank.length === 0) {
    for (const s of order) out[s] = ''
    return out
  }
  const reserved = bank[bank.length - 1]
  const pool = bank.slice(0, -1)
  let i = 0
  for (const s of order) {
    if (s === 'cta-final') {
      out[s] = reserved
      continue
    }
    out[s] = pool[i % pool.length]
    i++
  }
  return out
}
