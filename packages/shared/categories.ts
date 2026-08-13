// Categorías del buscador: los chips que ve el usuario.
//
// El inventario está guardado por NICHO (528 nichos con productos, y el daemon
// suma más cada vuelta). Los chips por nicho no escalan a esa cantidad, así que
// acá se agrupan en 12 categorías de compra.
//
// ⚠️ Es un clasificador por REGLAS ORDENADAS (primera que matchea gana), no un
// mapa nicho→categoría. Un mapa exigiría mantener a mano las 528 entradas — y
// medido 2026-08-12, las secciones de `apps/worker/niches.txt` (la fuente obvia
// para generarlo) solo cubren el 77.5% de los productos: 160 nichos con 6431
// productos ("gadgets cocina", "accesorios para auto", "tecnología", "smart
// home") no salen de ninguna sección, y la sección de anatomía sola se lleva el
// 40% del inventario, que como chip único no le sirve a nadie. Las reglas
// clasifican también lo que el daemon descubra mañana, sin tocar este archivo.
//
// El ORDEN es la lógica: "cama para perros" tiene que caer en Mascotas antes de
// que "cama" lo mande a Hogar, y "leggings deportivos" en Fitness antes de que
// "leggings" lo mande a Moda. Al agregar una regla, va después de las que
// deberían ganarle.

export type CategoryId =
  | 'mascotas' | 'bebes' | 'ortopedia' | 'fitness' | 'belleza' | 'suplementos'
  | 'descanso' | 'tecnologia' | 'auto' | 'cocina' | 'hogar' | 'moda' | 'salud'

export type Category = { id: CategoryId; label: string; test: RegExp }

// Sin acentos y en minúscula: los nichos entran de las dos formas
// ("organización hogar" y "tecnología" conviven con los sin tilde).
export const normalizeNiche = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

// El orden de este array ES el orden de evaluación.
export const CATEGORIES: Category[] = [
  {
    id: 'mascotas',
    label: 'Mascotas',
    test: /\b(perros?|gatos?|mascotas?|antipulgas|arenero|canino|felino)\b|correa retractil|bebedero|comedero/,
  },
  {
    id: 'bebes',
    label: 'Bebés y niños',
    test: /\bbebes?\b|biberon|chupete|\bcunas?\b|panal|mordedores|andador|cambiador|portabebe|juguetes educativos|silla de comer|extractor de leche|aspirador nasal|\bninos?\b|infantil/,
  },
  {
    id: 'ortopedia',
    label: 'Ortopedia y soporte',
    test: /corrector de postura|ortopedic|\bfajas?\b|cabestrillo|inmovilizador|plantillas|calcetines de compresion|medias de compresion|cojin para coxis|rodillera|munequera|tobillera|codera|collarin/,
  },
  {
    id: 'fitness',
    label: 'Fitness y deporte',
    test: /mancuerna|bandas? de resistencia|\byoga\b|eliptica|caminadora|bicicleta|kettlebell|dominadas|foam roller|deportiv|correr|gimnasio|cuerda para saltar|abdominales|pesas|entrenamiento/,
  },
  {
    id: 'belleza',
    label: 'Belleza y cuidado personal',
    test: /\bpiel\b|acne|cabello|calvicie|alopecia|caspa|frizz|canas|barba|afeitad|depilacion|\bvello\b|cuero cabelludo|\bunas?\b|pestanas|cejas|labios|arrugas|manchas|celulitis|estrias|flacidez|maquillaje|serum|crema|shampoo|protector solar|bronceado|autobronceante|melasma|\bporos\b|cicatrices|aceite corporal|acido hialuronico|agua micelar|mascarillas faciales|microblading|tinte|alisad|plancha de cabello|secador|cepillo alisador|capilar|facial|\brostro\b|levantamiento|doble menton|parpados caidos|bolsas en los ojos|ojeras|\bbelleza\b|lunares|verrugas|escote|\bbusto\b|gluteos/,
  },
  {
    id: 'suplementos',
    label: 'Suplementos y nutrición',
    test: /\bte verde\b|ginseng|matcha|stevia|espirulina|\bmaca\b|\bmiel\b|jengibre|curcuma|linaza|semillas de chia|frutos secos|granola|\bzinc\b|\bhierro\b|\bcalcio\b|acido folico|biotina|coenzima|electrolitos|colageno|moringa|\bfibra\b|enzimas digestivas|\bdetox\b|proteina|omega|vitamina|control de apetito|bajar de peso|\bazucar\b/,
  },
  {
    id: 'descanso',
    label: 'Descanso y bienestar',
    test: /insomnio|dormir|\bsueno\b|apnea|ronquidos|antifaz|masaje|aceites esenciales|difusor|aroma|ansiedad|estres|meditacion|sauna|manta electrica|bolsa de agua caliente|compresa termica|parche de calor|acupresion|electroestimulador|\bbienestar\b|relajacion/,
  },
  {
    id: 'tecnologia',
    label: 'Tecnología',
    test: /audifonos|smartwatch|banda inteligente|camara|parlante|bluetooth|cargador|power bank|tablet|laptop|celular|teclado|\bmouse\b|webcam|microfono|proyector|smart home|inteligente|gaming|gamer|luces led|aro de luz|linterna|tripode|impresora|home office|tecnologia|filtro azul/,
  },
  {
    id: 'auto',
    label: 'Auto, moto y herramientas',
    test: /\bautos?\b|\bmotos?\b|\bcascos?\b|taladro|destornillador|herramienta|nivel laser|retroceso|\bdiy\b/,
  },
  {
    id: 'cocina',
    label: 'Cocina',
    test: /cocina|cafetera|batidora|licuadora|\bollas?\b|sarten|cuchillo|utensilios|tabla de cortar|recipientes hermeticos|\btaper\b|freidora|sandwichera|hervidor|reposteria|extractor de jugos|procesadora de alimentos|filtro de agua|botellas de agua|\btermo\b|alimentos/,
  },
  {
    id: 'hogar',
    label: 'Hogar y organización',
    test: /\bhogar\b|sabanas|colchon|cobija|edredon|almohada|cortinas?|alfombras|perchas|organizador|organizadores|cajas organizadoras|ganchos adhesivos|macetas|plantas artificiales|muebles|espejos|cuadros decorativos|lampara|aspirador|trapeador|\bmopa\b|limpiavidrios|quitamanchas|limpiador a vapor|desinfectante|lavanderia|purificador|ventilador|ducha|\bbano\b|jabon|zapatero|silla ergonomica|ergonomia|riego|jardin|sostenibilidad/,
  },
  {
    id: 'moda',
    label: 'Moda y accesorios',
    test: /leggings|carteras|joyeria|aretes|collares|relojes|lentes|zapatillas|zapatos|pantuflas|maleta|mochila|billetera|brasier|\bropa\b|pantalon|pijamas|body shaper|bolsos|gorra|sombrero|\bmoda\b|accesorios cabello/,
  },
  {
    // Va al final a propósito: es la categoría más grande (dolencias + anatomía)
    // y sus palabras aparecen dentro de nichos de otras ("hongos en las uñas" es
    // salud, "uñas en gel" es belleza — gana el que va primero acá abajo).
    id: 'salud',
    label: 'Salud y dolor',
    test: /\bdolor|calambres|\bgases\b|endometrio|trompas de falopio|disfuncion erectil|hernia|artritis|artrosis|tendinitis|bursitis|bursas|inflamacion|ciatica|lumbago|contractura|esguince|juanetes|callos|espolon|fascitis|hongos|varices|hemorroides|diabet|tiroides|colesterol|presion arterial|hipertension|anemia|asma|reflujo|gastritis|colon|higado|rinon|riniones|prostata|menopausia|fertilidad|libido|incontinencia|infeccion|candidiasis|dermatitis|eczema|psoriasis|rosacea|sudoracion|hiperhidrosis|tinnitus|vertigo|migrana|cancer|osteoporosis|gota\b|acido urico|glucosa|metabolismo|circulacion|digestion|inmunidad|memoria|fatiga|salud|sensibilidad dental|blanqueamiento dental|ortodoncia|bruxismo|mal aliento|encias|dientes|caries|congestion|rinitis|amigdalas|garganta|ronquera|apendice|vesicula|pancreas|intestino|estomago|vejiga|utero|ovarios|menstrual|colicos|embarazo|postura|joroba|escoliosis|cervical|lumbar|columna|articulacion|musculo|musculos|tendon|ligamento|cartilago|hueso|huesos|nervio|nervios|hinchazon|retencion de liquidos|edema|herida|ulcera|quemadura|alergia|autoinmune|hormona|glandula|glandulas|linfatico|arterias|capilares|venas|corazon|pulmones|bronquios|traquea|alveolos|diafragma|pleura|peritoneo|bazo|timo|hipofisis|paratiroides|suprarrenales|globulos|plaquetas|orina|ureteres|uretra|cuello|hombro|rodilla|espalda|\bmanos?\b|talon|abdomen|cintura|\bpies?\b|pierna|muneca|tobillo|\bcodo\b|cadera|muslo|pantorrilla|antebrazo|\bbrazos?\b|dedos?|\bojos?\b|\bnariz\b|\borejas?\b|\boido|\bboca\b|lengua|paladar|mandibula|craneo|cabeza|\bcara\b|mejillas|sienes|costillas|esternon|ingle|pelvis|\bano\b|recto|vagina|vulva|clitoris|pene|escroto|glande|prepucio|testiculo|pezones|axilas|\bcerebro\b|cristalino|cornea|retina|conductos|esofago|senos paranasales|fosas nasales|cera en los oidos|cuerdas vocales|laringe|equilibrio|sistema nervioso|fascia|tejido adiposo|grasa|suelo pelvico|palmas|planta del pie|cuerpo/,
  },
]

/** La categoría del nicho, o null si ninguna regla lo reclama. */
export function categoryOf(niche: string): CategoryId | null {
  const n = normalizeNiche(niche)
  return CATEGORIES.find((c) => c.test.test(n))?.id ?? null
}

export const isCategoryId = (v: unknown): v is CategoryId =>
  typeof v === 'string' && CATEGORIES.some((c) => c.id === v)

export const categoryLabel = (id: CategoryId): string =>
  CATEGORIES.find((c) => c.id === id)!.label
