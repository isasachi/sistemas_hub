import type { BodyFocus, DemographicId, NicheId, SectionType } from './types'

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

// ─── Banco de poses por ZONA (2026-08-15) ───────────────────────────────────
// Los bancos de arriba son de ACTITUD y están todos encuadrados en el rostro: sirven para un
// sérum, no para una rodillera ni para una creatina de glúteos. Estos son de ENCUADRE: dicen qué
// parte del cuerpo ocupa el carril, y NUNCA muestran la cara — la cara vive en el hero, que sigue
// tomando su pose del banco demográfico.
//
// Son agnósticos de demografía a propósito: quién es la persona lo fija `model_persona` (y la
// placa de talento), así que duplicar cada banco por las 6 demografías daría 60 listas para
// decir lo mismo. Por eso están redactados sin género ni edad.
//
// `rostro` y `cabello` NO tienen banco: para esas zonas el banco demográfico YA es el correcto, y
// dejarlas vacías es lo que hace que todo lo que existe hoy salga idéntico.
// La ÚLTIMA pose de cada banco es la reservada de `assignPoses` (producto junto a la zona).
export const ZONE_POSES: Record<BodyFocus, string[]> = {
  rostro: [],
  cabello: [],
  torso: [
    'Torso de frente recortado del cuello a la cintura, hombros abiertos, sin rostro en cuadro',
    'Torso en 3/4, una mano apoyada sobre el esternón, encuadre de hombros a cintura',
    'Perfil del torso, espalda erguida, luz rasante marcando la línea del hombro',
    'Torso de frente sosteniendo el envase a la altura del pecho, sin rostro en cuadro',
  ],
  abdomen: [
    'Abdomen y cintura de frente, encuadre del pecho bajo a la cadera, manos relajadas a los costados',
    'Abdomen en 3/4, una mano apoyada sobre el costado de la cintura',
    'Perfil de la cintura, postura erguida, sin rostro en cuadro',
    'Abdomen de frente con el envase sostenido a la altura de la cintura',
  ],
  gluteos_piernas: [
    'Tren inferior de espaldas, de la cintura a media pantorrilla, postura de pie firme, sin rostro en cuadro',
    'Tren inferior en 3/4 de espaldas, peso sobre una pierna, línea de glúteo y muslo definida',
    'Piernas de perfil en posición de zancada corta, encuadre de cadera a tobillo',
    'Tren inferior de espaldas con el envase sostenido a la altura de la cadera',
  ],
  rodilla: [
    'Rodilla y pierna en primer plano, persona sentada al borde de una superficie, encuadre de muslo a pantorrilla',
    'Rodilla de perfil en flexión suave, ambas manos apoyadas alrededor de la articulación',
    'Rodilla de frente, pierna estirada, encuadre cerrado sin rostro en cuadro',
    'Rodilla en primer plano con el envase apoyado al lado, sobre la misma superficie',
  ],
  articulacion: [
    'Hombro y brazo en primer plano, una mano del lado contrario apoyada sobre la articulación',
    'Codo en flexión suave, encuadre cerrado del brazo, sin rostro en cuadro',
    'Muñeca y antebrazo en primer plano, giro suave de la mano',
    'Articulación en primer plano con el envase apoyado al lado',
  ],
  manos: [
    'Ambas manos en primer plano sobre una superficie clara, dedos relajados, sin rostro en cuadro',
    'Una mano en 3/4 con los dedos ligeramente extendidos, luz suave lateral',
    'Manos entrelazadas en primer plano, encuadre cerrado de muñecas a dedos',
    'Manos sosteniendo el envase, encuadre cerrado sin rostro en cuadro',
  ],
  pies: [
    'Ambos pies en primer plano sobre una superficie clara, encuadre de tobillo a dedos',
    'Un pie en 3/4 apoyado, el otro ligeramente atrás, sin rostro en cuadro',
    'Pies de perfil en paso corto, encuadre cerrado',
    'Pies en primer plano con el envase apoyado al lado, sobre la misma superficie',
  ],
  // ⚠️ VACÍO A PROPÓSITO — `cuerpo_completo` NO ES UNA ZONA, es la ausencia de zona, y no lleva
  // placa propia. Tenía un banco de poses de cuerpo entero y `zoneNeedsOwnPlate` devolvía true, así
  // que un suplemento de bienestar general (la rama que `classify.ts` manda explícitamente acá)
  // generaba una placa "de cabeza a pies a distancia media" y TODA sección menos el hero salía con
  // una persona de pie, entera y rígida — reportado como "parado como un maniquí, le quita
  // profesionalidad". Medido en la sesión 147b44d4 (GomiSleep, body_focus `cuerpo_completo`,
  // talent_zone_url poblada).
  //
  // El encuadre de este proyecto NUNCA fue de cuerpo entero: o medio cuerpo, o rostro, o la zona
  // concreta (glúteos/rodilla/pies). Con el banco vacío, `zoneNeedsOwnPlate` devuelve false y la
  // sección vuelve al retrato canónico (`buildTalentPrompt`: HALF-BODY, cabeza y torso) con las
  // poses demográficas — exactamente el comportamiento anterior a que existiera el eje de zona.
  // El valor sigue en el enum porque es la respuesta HONESTA del clasificador para un producto sin
  // zona visible; lo que cambia es qué significa al renderizar.
  cuerpo_completo: [],
}

// Nombre legible (UI) — el selector de Identidad, junto a nicho y demografía.
export const BODY_FOCUS_LABELS: Record<BodyFocus, string> = {
  rostro: 'Rostro',
  cabello: 'Cabello',
  torso: 'Torso / busto',
  abdomen: 'Abdomen / cintura',
  gluteos_piernas: 'Glúteos y piernas',
  rodilla: 'Rodilla',
  articulacion: 'Articulación (hombro, codo, muñeca)',
  manos: 'Manos y uñas',
  pies: 'Pies',
  cuerpo_completo: 'Sin zona específica (medio cuerpo)',
}

// Encuadre en lenguaje de prompt. Lo consumen la PLACA de zona (`talent.ts`) y la nota de
// antes/después: los dos necesitan nombrar la misma zona con las mismas palabras, y si cada uno la
// escribiera por su lado podrían pedir recortes distintos para la misma sesión.
export const BODY_FOCUS_FRAMING: Record<BodyFocus, string> = {
  rostro: 'el rostro, encuadre de retrato de la cabeza a los hombros',
  cabello: 'el cabello, encuadre de la cabeza y los hombros mostrando el largo y la textura del pelo',
  torso: 'el torso, encuadre del cuello a la cintura, SIN el rostro en cuadro',
  abdomen: 'el abdomen y la cintura, encuadre del pecho bajo a la cadera, SIN el rostro en cuadro',
  gluteos_piernas: 'el tren inferior — glúteos y piernas —, encuadre de la cintura a media pantorrilla, SIN el rostro en cuadro',
  rodilla: 'la rodilla, encuadre cerrado del muslo a la pantorrilla, SIN el rostro en cuadro',
  articulacion: 'la articulación (hombro, codo o muñeca), encuadre cerrado del miembro, SIN el rostro en cuadro',
  manos: 'las manos, encuadre cerrado de muñecas a dedos, SIN el rostro en cuadro',
  pies: 'los pies, encuadre cerrado de tobillos a dedos, SIN el rostro en cuadro',
  // Sin zona visible = el encuadre por defecto del proyecto, medio cuerpo. NO se gatea por
  // `zonePlate`: `beforeAfterNote` lo lee siempre, así que dejarlo en "cabeza a pies" mandaba los dos
  // paneles de antes/después a cuerpo entero aunque ya no hubiera placa de zona.
  cuerpo_completo: 'a la persona de medio cuerpo, encuadre de la cabeza a la cintura',
}

// `rostro`/`cabello` ya están servidos por el banco demográfico y por la placa canónica: no
// necesitan banco de zona ni una segunda placa. Es lo que mantiene intacto todo lo que ya existe.
export function zoneNeedsOwnPlate(focus: BodyFocus | null | undefined): boolean {
  return !!focus && ZONE_POSES[focus].length > 0
}

// Plantilla base de persona por demografía (Anexo B, reglas transversales: rasgos coherentes
// con {{locale}} — es-PE aquí — piel real con textura natural, sin idealizar). Se concreta con
// más detalle de locale/rasgos en la extracción (`model_persona` se escribe una vez y se repite
// literal en las 8 secciones: mismo rostro, mismo peinado, misma ropa, mismos accesorios).
export const DEMOGRAPHIC_PERSONA: Record<DemographicId, string> = {
  female_18_30: 'Mujer peruana de 18-30 años, piel real con textura natural, cabello recogido, aretes dorados discretos, expresión serena y segura',
  female_30_45: 'Mujer peruana de 30-45 años, piel real con textura natural, cabello suelto con ondas suaves, sin joyería llamativa, expresión cálida y confiada',
  female_45_plus: 'Mujer peruana de 45 años o más, piel real con textura natural, canas visibles o cabello entrecano, expresión de bienestar y alivio sereno',
  male_20_35: 'Hombre peruano de 20-35 años, piel real con textura natural, cabello corto prolijo, expresión de confianza física',
  male_35_55: 'Hombre peruano de 35-55 años, piel real con textura natural, barba corta prolija, expresión de autoridad tranquila',
  senior_55_plus: 'Persona peruana mayor de 55 años, piel real con textura natural, cabello canoso, expresión cálida y estable',
  no_talent: '',
}

// ─── Vestuario (2026-08-15) ─────────────────────────────────────────────────
// La ROPA salió de `DEMOGRAPHIC_PERSONA`, donde estaba incrustada y era ciega al producto: una
// `female_18_30` iba con "camiseta blanca de tirantes" tanto para un sérum como para una creatina
// de glúteos, y el modelo rellenaba lo que faltaba abajo — en un caso real, un short de jean para
// un producto cuya promesa es el tren inferior. El vestuario no es un rasgo de la persona: es una
// función del NICHO (qué registro) y de la ZONA (qué tiene que dejarse ver).
//
// Tabla y no LLM, por la misma razón que la tipografía, el halo y los props: hay ~20 respuestas
// posibles, la decisión es estable y pedírsela a un modelo agrega una variable que después hay que
// auditar en cada corrida.
export const NICHE_WARDROBE: Record<NicheId, string> = {
  supplement_skin_female: 'top o camiseta lisa de tono neutro, look limpio de cuidado personal',
  skincare_topical: 'top o camiseta lisa de tono neutro, hombros descubiertos, look limpio de skincare',
  haircare: 'camiseta lisa de tono neutro que no compita con el cabello',
  fitness_weightloss: 'ropa deportiva de entrenamiento ajustada — licra y top deportivo',
  supplement_male_performance: 'camiseta deportiva ajustada o musculosa de color neutro',
  joint_mobility: 'ropa deportiva cómoda de entrenamiento suave, tejido elástico',
  intimate_wellness: 'ropa de casa cómoda y discreta, tonos suaves, nada sugerente',
  herbal_natural: 'prendas de fibras naturales en tonos tierra, look sereno',
  baby_maternity: 'ropa de casa suave y cómoda en tonos claros',
  pets: 'ropa casual de diario, cómoda',
  home_cleaning: 'ropa casual de estar en casa, mangas remangadas',
  tech_gadgets: 'ropa urbana minimalista de tonos neutros',
  kitchen_tools: 'ropa casual con delantal de cocina liso',
  jewelry_fashion: 'prenda elegante y sobria que no compita con la pieza',
  automotive: 'ropa de trabajo casual, resistente',
  generic: 'ropa casual sencilla de tono neutro',
}

// Restricción de la ZONA: la prenda tiene que DEJAR VER la parte que el producto cambia. Sin esto,
// una rodillera con "ropa deportiva cómoda" sale con pantalón largo y la rodilla tapada — el mismo
// fallo que el short de jean, en otra zona. Solo llevan entrada las zonas que lo necesitan; el
// resto usa el vestuario del nicho tal cual.
export const WARDROBE_FOR_FOCUS: Partial<Record<BodyFocus, string>> = {
  torso: 'la prenda superior deja ver la línea del torso',
  abdomen: 'la prenda deja el abdomen y la cintura a la vista',
  gluteos_piernas: 'la prenda inferior es ceñida y de cintura alta (licra o calza), y deja ver la forma de glúteos y piernas — nunca jean, pantalón suelto ni falda',
  rodilla: 'la prenda inferior es corta (short) y deja la rodilla completamente descubierta — nunca pantalón largo',
  articulacion: 'la prenda deja la articulación descubierta — sin manga o manga corta',
  pies: 'pies descalzos o con sandalia simple, tobillos a la vista',
}

// Arma la persona completa: rasgos (demografía) + vestuario (nicho + zona). Es lo que se guarda
// como `model_persona` y viaja LITERAL a las dos placas y a las 8 secciones, así que tiene que
// resolverse UNA vez acá y no re-derivarse en cada consumidor.
export function personaFor(
  demographic: DemographicId,
  niche: NicheId,
  focus?: BodyFocus | null,
): string {
  const base = DEMOGRAPHIC_PERSONA[demographic]
  if (!base) return base // no_talent: el carril lo llena el sustituto por nicho, sin persona
  const zona = focus ? WARDROBE_FOR_FOCUS[focus] : undefined
  return [base, `viste ${NICHE_WARDROBE[niche]}${zona ? `, y ${zona}` : ''}`].join(', ')
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
// `focus` reparte entre DOS bancos (2026-08-15): el HERO conserva la pose demográfica —muestra la
// cara, que es lo que construye confianza al abrir la landing— y el resto de las secciones con
// protagonista toman la pose de la ZONA donde el producto actúa. Con `rostro`/`cabello` el banco de
// zona está vacío y todo sale del demográfico: comportamiento histórico exacto.
export function assignPoses(
  order: SectionType[],
  demographic: DemographicId,
  focus?: BodyFocus | null,
): Record<string, string> {
  const bank = DEMOGRAPHIC_POSES[demographic]
  const out: Record<string, string> = {}
  if (bank.length === 0) {
    for (const s of order) out[s] = ''
    return out
  }
  const zone = focus ? ZONE_POSES[focus] : []
  const reserved = bank[bank.length - 1]
  const pool = bank.slice(0, -1)
  const zonePool = zone.slice(0, -1)
  // Dos cursores: cada banco recorre el suyo, así ninguna sección repite pose dentro de su pool
  // (QA#6) aunque el reparto entre bancos sea desparejo.
  let i = 0
  let z = 0
  for (const s of order) {
    if (s === 'cta-final') {
      out[s] = zonePool.length ? zone[zone.length - 1] : reserved
      continue
    }
    if (zonePool.length && s !== 'hero') {
      out[s] = zonePool[z % zonePool.length]
      z++
      continue
    }
    out[s] = pool[i % pool.length]
    i++
  }
  return out
}
