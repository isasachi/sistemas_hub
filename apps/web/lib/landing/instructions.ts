import { cleanAccentWord, type SectionCopy, type SectionType, type LandingDna, type PaletteTokens, type Offer, type TrustBlock, type NicheId, type PaymentMethod, type BodyFocus } from './types'
import { NICHE_LABELS } from './niches'
import { BODY_FOCUS_FRAMING } from './demographics'
import { SECTION_DNA } from './section-dna'
import { moneyRamp, type MoneyRamp } from './palette-derive'
import { styleOf, DEFAULT_STYLE } from './style-dna'

// Builders puros ($0) para el prompt de imagen de cada sección de la landing (motor de DIFUSIÓN).
// FUENTE DE VERDAD: docs/superpowers/specs/2026-07-23-generador-landing-spec.md §1-§5 + Anexos.
// El ADN (`LandingDna`, extraído UNA vez por sesión en el step previo 0.b) reemplaza a la marca
// derivada/paleta suelta del motor viejo: paleta por fórmula, partículas, props, tipografía,
// halo, persona y poses ya vienen resueltos y se inyectan literales, sin recalcularlos acá.
// Capas ensambladas en orden (spec): BRAND → DESIGN_SYSTEM → CONTENIDO DE CARRILES →
// SECTION_SPECS → Copy → TEXT_RULES → referencias adjuntas (nota de plantilla).
// Motor plantilla-como-scaffold (2026-07-23 cont.): la composición (zonas Z1-Z6, anatomía de
// cards, carriles) ya NO se describe en texto — la lleva la última imagen adjunta (plantilla
// curada por sección). El prompt solo inyecta lo que la plantilla no puede saber: talento/
// sustituto, props del nicho y partículas on/off (ver `masterLayoutBlock`/`templateNote`).
//
// Filosofía (spec 2026-07-23): las secciones llevan talento (o su sustituto) Y producto Y props.
// EXCEPCIÓN (ajuste 2026-07-23 post-smoke; ampliada motor-plantilla): `faq`, `testimonios`,
// `garantia` y `cta-final` NUNCA llevan al talento/protagonista de la campaña
// (`NO_TALENT_SECTIONS`) — las plantillas curadas de esas 4 secciones no reservan carril de
// persona; faq/garantia/cta-final no llevan persona alguna, testimonios solo muestra clientes
// distintos en sus tarjetas, no al protagonista.

// Secciones que NUNCA muestran al talento/protagonista de la campaña (contrato fijado por la
// plantilla adjunta, no por el nicho). No es el `no_talent` del nicho (sin gente): acá el nicho
// puede tener talento, pero ESTAS secciones no lo usan. `testimonios` sí muestra clientes (caras
// distintas) en sus cards; `faq`/`garantia`/`cta-final` no llevan persona alguna.
export const NO_TALENT_SECTIONS: Set<SectionType> = new Set(['faq', 'testimonios', 'garantia', 'cta-final'])

function copyBlock(raw: SectionCopy): string {
  // Segunda puerta de `cleanAccentWord` (la primera está en `copy.ts`, al generar). Esta repara las
  // sesiones YA guardadas —5 de 26 traen un accentWord que no está en su headline— sin migración: el
  // copy se persiste en jsonb y esta ruta lo vuelve a leer en cada render y regeneración.
  const copy = cleanAccentWord(raw)
  const lines: string[] = [`Headline: "${copy.headline}".`]
  // La palabra-acento se resalta con COLOR (no con corchetes ni comillas). Dirigirla evita que el
  // modelo elija otra o la envuelva en [ ] para "enfatizar".
  if (copy.accentWord) lines.push(`Emphasis: within the headline, render the words "${copy.accentWord}" in the brand ACCENT COLOR only — same font and size, NO brackets, quotes, underline or box around them.`)
  if (copy.subheadline) lines.push(`Subheadline: "${copy.subheadline}".`)
  if (copy.type === 'antes-despues') lines.push(`Label the left/before state "ANTES" and the right/after state "DESPUÉS" (those exact Spanish words, not "before/after").`)
  if (copy.bullets?.length) lines.push(`${copy.type === 'antes-despues' ? 'ANTES column — problems, each with a red ✗' : 'Bullets'}:\n${copy.bullets.map((b) => `  • ${b}`).join('\n')}`)
  if (copy.bulletsAfter?.length) lines.push(`AFTER column — results, each with a green ✓ (paired beside the BEFORE column):\n${copy.bulletsAfter.map((b) => `  • ${b}`).join('\n')}`)
  if (copy.cards?.length)
    lines.push(`Cards:\n${copy.cards.map((c) => `  - "${c.title}": "${c.body}"`).join('\n')}`)
  if (copy.cta) lines.push(`Call-to-action button label: "${copy.cta}".`)
  if (copy.kicker) lines.push(`Kicker (subtítulo dorado con guiones laterales "— TEXTO —"): "${copy.kicker}".`)
  if (copy.closingBold) lines.push(`Closing card — frase bold: "${copy.closingBold}"${copy.closingSub ? `; subcopy: "${copy.closingSub}"` : ''}.`)
  if (copy.closingStrip) lines.push(`Franja de cierre inferior (mayúsculas, reemplaza la barra de confianza): "${copy.closingStrip}".`)
  if (copy.socialProof) lines.push(`Banda de prueba social (con escudo): "${copy.socialProof}".`)
  if (copy.ctaHeadline) lines.push(`Bloque CTA — titular en mayúsculas: "${copy.ctaHeadline}"${copy.ctaSub ? `; subcopy: "${copy.ctaSub}"` : ''}.`)
  return lines.join('\n')
}

// ─── Capa 2 — BRAND (spec §1) ────────────────────────────────────────────────
// El envase = Imagen 1 (canónico), SIEMPRE el mismo objeto — nunca se reinventa forma, tapa,
// proporción ni material. Los labels son EXCLUSIVAMENTE `productLabels` (ground-truth tipeado
// por el usuario) en la jerarquía del spec; sin ellos, se leen de las fotos reales (Imagen 2+).
function brandBlock(productLabels: string | null): string {
  const lines: string[] = [
    'BRAND — el envase renderizado es SIEMPRE el mismo objeto de la Imagen 1 (envase canónico): misma forma, proporciones, tapa, material y color exacto. Nunca se reinventa forma, tapa, proporción ni material.',
    'PROPORCIONES REALES (crítico): renderizá el envase con su relación ancho/alto NATURAL de frasco real, IDÉNTICA en todas las secciones. NUNCA lo estires, alargues, angostes ni comprimas — aunque la imagen de referencia venga recortada, parcial o angosta, reconstruí las proporciones reales del frasco. Un envase estirado o deforme es criterio de fallo.',
  ]
  if (productLabels && productLabels.trim()) {
    lines.push(
      `El texto de la etiqueta es EXCLUSIVAMENTE este (ground-truth), en esta jerarquía de mayor a menor peso visual:\n${productLabels.trim()}\nOrden: 1) marca (mayor peso, negro) 2) sub-marca 3) descriptor 4) línea de ingredientes (dentro de una caja con borde fino) 5) cantidad/unidades. Prohibido inventar, traducir, abreviar o completar ingredientes: si un ingrediente no está en esta lista, no existe. La etiqueta debe ser IDÉNTICA entre secciones — es el criterio de fallo #1.`,
    )
  } else {
    lines.push(
      'Sin texto de etiqueta provisto como dato: lee el texto EXACTO impreso en las fotos reales del producto (Imagen 2 en adelante) y repítelo tal cual, sin inventar, traducir, abreviar ni completar nada.',
    )
  }
  return lines.join('\n')
}

// ─── Capa 3 — DESIGN_SYSTEM (spec §2) ────────────────────────────────────────
// Paleta aplicada POR ROL (nunca "elige un color bonito"): cada token del ADN tiene un uso fijo.
// El precio tachado (#D93025) es invariante. La rampa de metal (oro, o cobre si la marca es
// dorada — ver `moneyRamp`) llega como parámetro para que ESTA capa y la banda de confianza
// nombren siempre el mismo color: si cada una lo calculara, podrían contradecirse.
// NOTA (motor plantilla-como-scaffold, desviación deliberada del brief): la línea de partículas
// que vivía acá se retiró — `masterLayoutBlock` es ahora el ÚNICO emisor de la instrucción de
// partículas (on/off vía `dna.particles_on`). Dejarla acá duplicada contradecía el caso OFF: el
// prompt decía "Siempre presentes" (esta capa) Y "SIN partículas" (masterLayoutBlock) a la vez.
function designSystemBlock(dna: LandingDna, money: MoneyRamp): string {
  const p: PaletteTokens = dna.palette
  // Lenguaje MATERIAL heredado de la marca (2026-08-15). Antes de esto las cuatro líneas de abajo
  // que lo describen eran texto fijo, idéntico en toda sesión: la marca solo movía los hex y todas
  // las landings salían con el mismo vidrio esmerilado y los mismos iconos 3D glossy. Ojo con el
  // límite: MATERIAL sí, GEOMETRÍA no — el radio, la anatomía de la card, la cinta, el chevron y
  // las pills los sigue mandando la plantilla adjunta (ver style-dna.ts y `templateNote`).
  const st = styleOf(dna.style)
  // `undefined` = paleta LEGADA (guardada antes de que existiera el campo; `getLandingSession`
  // castea sin `.parse()`, así que el `.default('light')` del schema no corre al leer). 'light' es
  // el comportamiento histórico → una sesión vieja sale idéntica a como salía.
  const dark = p.polarity === 'dark'
  return [
    'DESIGN_SYSTEM —',
    `Fondo: degradado vertical/diagonal suave de ${p.bg_start} (superior) a ${p.bg_end} (inferior). Nunca fondo plano, ${dark ? 'nunca negro puro — el fondo es OSCURO y conserva el tinte de la marca, con profundidad atmosférica, no un negro plano de estudio' : 'nunca blanco puro'}. Textura del fondo (acabado de la marca): ${st.background}`,
    `Luz de la escena (acabado de la marca): ${st.light}`,
    `Halo: ${dna.halo}, detrás del talento (o de su sustituto).${dna.halo === 'none' ? ' La separación figura-fondo se resuelve solo con el degradado y la profundidad.' : ''} Constante en todo el funnel.`,
    'Base (invariante): superficie reflectante en el borde inferior donde el envase proyecta reflejo vertical difuso.',
    'Profundidad (invariante): tres planos — fondo atmosférico, talento, producto + props en primer plano. Ligera profundidad de campo en el fondo.',
    `Paleta aplicada por ROL: titular base en ${p.color_headline}; palabra destacada del titular en ${p.color_accent}; cuerpo de texto en ${p.color_body}; superficie de card en ${p.color_surface} (la OPACIDAD y el acabado de esa superficie los define el estilo de marca, más abajo en «Componentes» — no la fijes acá); iconos en ${p.color_icon.join(', ')} (uno por atributo).${dark ? ' Pieza de MODO OSCURO: el fondo, las superficies de card y las bandas son oscuros, y el texto encima va claro. El acabado de las superficies es el mismo que define el estilo de marca abajo — solo cambia que se aplica sobre superficie oscura.' : ''}`,
    `CONSISTENCIA DE COLOR (crítico): estos hex son los MISMOS exactos en las 8 secciones del funnel — el acento ${p.color_accent}, el titular ${p.color_headline} y los íconos NO deben variar de tono, saturación ni brillo de una sección a otra. Son el color EXACTO de la marca, no una sugerencia aproximada.`,
    // El oro es invariante salvo que la marca sea dorada (decisión #6): ahí marca y oro se
    // confundirían y muere la regla de significado. El TRATAMIENTO metálico se mantiene siempre —
    // es sobre él, no sobre el tono, que cabalga la distinción.
    `Oferta/premium/sellos: degradado metálico ${money.name} ${money.dark}→${money.light}, y ÚNICAMENTE ahí — oferta, sellos de garantía, cinta "RECOMENDADO", la etiqueta "DESPUÉS" y la BANDA DE CONFIANZA del pie. En ningún otro lugar. Precio ancla tachado en #D93025. Regla de significado (invariante): el color de marca comunica confianza; el metal ${money.name} comunica dinero y urgencia — por eso NUNCA deben ser el mismo color.`,
    `Tipografía: una sola familia, ${dna.font_family}. Toda la expresividad viene de peso + color + tamaño, jamás de una segunda fuente.${dna.font_accent ? ` ${dna.font_accent} se usa SOLO en el titular de hero/oferta, nunca en cuerpo ni cards.` : ''} Expresión tipográfica de la marca: ${st.type}`,
    'Titular (invariante): 3-4 líneas, alineado a la izquierda, ragged right; conviven líneas neutras en el color de titular semibold y 1-2 palabras clave en el color de acento extrabold, a mayor tamaño. Subtítulo: 1 línea, ~40% del tamaño del titular, con una palabra en el color de acento.',
    'Card title (invariante): bold en el color de titular. Card body: regular en el color de cuerpo, máximo 2 líneas. Microcopy: uppercase bold + descriptor regular debajo, a menor tamaño.',
    `Componentes — la GEOMETRÍA es invariante (radio, proporciones y anatomía los manda la plantilla); el MATERIAL lo manda la marca. Card: radio 28-32px, con este acabado — ${st.surface} Icono: ${st.icon} Diámetro constante dentro de una misma sección.`,
    'Componentes de oferta (geometría invariante, solo cambia color): Pill: "ANTES" en gris oscuro, "DESPUÉS" en dorado. Chevron: doble »» en el color de acento dentro de un círculo blanco entre las dos cards de comparación. Cinta de oferta: banda dorada con corona, superpuesta al borde superior de la card central. Sello: medalla circular dorada con texto curvo. CTA: botón redondeado — acento sólido en opciones laterales, dorado en la recomendada.',
  ].join('\n')
}

// ─── Capa 4 — CONTENIDO DE CARRILES (spec §3, motor plantilla-como-scaffold) ─
// La composición (zonas, carriles, anatomía de cards) la lleva la PLANTILLA adjunta (ver
// `templateNote`): este bloque ya NO la describe. Solo cubre lo que la plantilla NO puede saber:
// quién ocupa el carril de talento (persona/sustituto/ninguno), qué props del nicho lleva el
// producto (excluyendo los de otro nicho aunque la plantilla los muestre) y si van partículas.
function masterLayoutBlock(
  dna: LandingDna,
  section: SectionType,
  hasTalent: boolean,
  talentSubstitute: string | undefined,
  demographicLabel: string | undefined,
  bodyFocus: BodyFocus | undefined,
  zonePlate: boolean | undefined,
): string {
  const pose = dna.poses[section] ?? ''
  const talentText = NO_TALENT_SECTIONS.has(section)
    ? section === 'testimonios'
      // ⚠️ "ROSTROS DISTINTOS ENTRE SÍ" NO ALCANZA — salían tres clones. Es una restricción de
      // comparación, y el modelo la satisface con tres variaciones mínimas de la misma cara: mismo
      // tono de piel, mismo pelo, misma edad, misma ropa. Lo que separa las caras es nombrar EJES
      // CONCRETOS Y ORTOGONALES tarjeta por tarjeta (tono de piel, pelo, forma de cara, ropa), que
      // es lo mismo que ya se aprendió en video-ads: un pedido vago se cumple de la forma más barata.
      // La edad varía DENTRO del rango de la demografía: fuera de él se reintroduce justo el fallo
      // que la restricción demográfica existe para evitar.
      ? `Talento: esta sección NO muestra al protagonista de la campaña. Las únicas personas son los CLIENTES de las tarjetas${demographicLabel ? `, TODOS coherentes con la demografía objetivo (${demographicLabel}): mismo género y el mismo rango de edad, aunque el nombre del testimonio sugiera otra cosa` : ''}. Gente común peruana, NO modelos. Las 3 caras deben ser de TRES PERSONAS CLARAMENTE DISTINTAS, no la misma cara retocada: tarjeta 1 = piel trigueña, cabello oscuro y liso, cara ovalada, prenda de tono claro; tarjeta 2 = piel más clara que la 1, cabello castaño y más corto, cara redonda y ancha, prenda de tono medio; tarjeta 3 = piel más oscura que las otras dos, cabello ondulado, cara alargada de rasgos marcados, prenda de tono oscuro. Cada una con distinta edad dentro del rango, distinto peinado y distinta ropa; NUNCA repitas el mismo rostro, el mismo peinado ni el mismo color de prenda en dos tarjetas.`
      : 'Talento: esta sección NO lleva persona alguna. El carril lo ocupan el producto, sus props y la atmósfera.'
    : hasTalent
    // Con placa de zona el ENCUADRE se nombra además de venir en la imagen: la imagen es la que
    // manda, pero el texto evita que el modelo "complete" la cara que la placa deliberadamente
    // no muestra — la plantilla adjunta sí muestra un retrato y se la sugiere.
    ? `Persona (misma en todas las secciones con protagonista): ${dna.model_persona}.${zonePlate && bodyFocus ? ` ENCUADRE DE ESTA SECCIÓN: se muestra ${BODY_FOCUS_FRAMING[bodyFocus]} — la placa adjunta ya viene así; NO agregues la cara ni amplíes el encuadre para incluirla.` : ''} Pose de ESTA sección (variable, no se repite): ${pose}.`
    : `Sin talento humano: el carril lo ocupa el sustituto — "${talentSubstitute}" — sin renderizar ninguna persona/rostro/silueta.`
  // `undefined` = ADN legado (guardado antes de que existiera el campo; getLandingSession castea
  // sin `.parse()`, así que el `.default(true)` del schema nunca corre en la lectura). El default
  // de intención es ON: solo un `false` explícito apaga las partículas.
  const particles = dna.particles_on !== false
    ? `Partículas: ${dna.particle_type}, densidad ${dna.particle_density}, coherentes con el nicho y los props. En el aire, sin invadir texto.`
    : 'SIN partículas de fondo en este nicho — el fondo queda limpio, solo el degradado re-tintado.'
  return [
    'CONTENIDO DE CARRILES (lo que la plantilla no puede saber; la composición la manda la plantilla adjunta):',
    talentText,
    `Producto (invariante): en su slot de la plantilla, con reflejo en la base. Props derivados del nicho, apoyados con sombra de contacto: ${dna.props.join(', ')}. SOLO estos props — no agregues objetos de otro nicho (p. ej. moléculas/cápsulas fuera de suplementos) aunque la plantilla los muestre.`,
    particles,
  ].join('\n')
}

// ─── Capa 5 — REFUERZO COMPOSITIVO (checklist estructural, ADN de sección) ────
// Refuerza la composición de la plantilla con hechos ENUMERABLES por sección (conteos, roles,
// presencia/ausencia) para que la difusión no pierda ni descuente elementos. NO re-describe layout,
// espaciado ni tratamiento — eso lo lleva la PLANTILLA adjunta (motor plantilla-como-scaffold). El
// ADN vive en `section-dna.ts` (fuente única, compartida con el paso de copy). Reemplaza al viejo
// SECTION_SPECS_TEXT (one-liner por sección).
function compositionReinforcementBlock(section: SectionType): string {
  const items = SECTION_DNA[section].composition.map((c) => `  - ${c}`).join('\n')
  return `REFUERZO COMPOSITIVO — checklist estructural de ESTA sección (la PLANTILLA manda el look/espaciado; esto solo asegura que estén TODOS estos elementos, en su rol, sin perder ni descontar ninguno):\n${items}`
}

// ─── Capa 7 — TEXT_RULES (spec §5) ───────────────────────────────────────────
const TEXT_RULES = [
  'TEXT_RULES —',
  'Todo el texto visible en es-PE. Una sola variante regional en todo el funnel: tuteo peruano — prohibido voseo ("acabá", "recuperá", "te merecés") y localismos de otra región.',
  'Titular: verbo imperativo en 2ª persona + problema nombrado + promesa emocional (alternativa válida: pregunta de fricción). La palabra resaltada en el color de acento es siempre el PROBLEMA o la TRANSFORMACIÓN, NUNCA la marca.',
  'Beneficios: estructura idéntica en las 4 filas — "Verbo + objeto" (bold) / "y complemento" (regular). Sin excepciones de formato entre filas.',
  'Prueba: siempre anclada en tiempo ("desde la primera semana", "resultados en 4 a 8 semanas con uso constante"). Nunca promesa sin plazo.',
  'Objeciones: cada una se responde de forma explícita y literal en FAQ, no por insinuación.',
  'Oferta: ancla tachada + % de ahorro + precio por unidad + escasez temporal. Los tres precios y anclas son el MISMO set en todas las secciones del funnel.',
  'Moneda: "S/" siempre antepuesta, con el mismo formato en toda la pieza.',
  'Máximo 1 signo de exclamación por bloque. Sin mayúsculas sostenidas fuera del microcopy y las pills.',
  'Disciplina de texto: todo texto visible sale ÚNICAMENTE del copy de abajo + lo impreso en el producto — nunca renderices vocabulario de esta instrucción (nombres de capas, "ADN", "invariante", nombres de fuente) como si fuera copy de la pieza.',
  'CÓDIGOS DE COLOR = NUNCA son texto visible. Los valores de color de esta instrucción (#RRGGBB, rgb(...), rgba(...) — p.ej. "rgba(28,74,74,0.7)") indican SOLO qué color aplicar; JAMÁS deben aparecer escritos como texto en la imagen (ni en microcopy, ni en cards, ni en ningún lado). Si un texto necesita color de cuerpo, aplícalo como color — no escribas el código.',
].join('\n')

// ─── Capa 8 — Referencias adjuntas / nota de plantilla ──────────────────────
// Alineada con el contrato de orden de parts[] de la ruta (Task 9): producto canónico → fotos
// reales → talento (si hay) → plantilla de composición (última). A diferencia del motor viejo,
// la plantilla es ahora la FUENTE DE VERDAD de estructura (no un "apoyo mutable"): manda zonas,
// anatomía de cards, encuadre y tratamiento. Lo que cambia respecto a ella lo dice el resto de la
// instrucción (producto, cara del talento, copy, re-tinte de color, props/partículas del nicho).
function templateNote(talentImageAttached: boolean, dark: boolean, dna: LandingDna, zoneFraming?: string): string {
  // Las 8 plantillas curadas están armadas con acabado de VIDRIO ESMERILADO. Un estilo distinto es
  // texto peleando contra una imagen ráster, y la difusión le hace caso a la imagen — la misma
  // pelea que ya se perdió con la tonalidad. Por eso el carve-out repite la forma que sí funcionó:
  // nombra qué muestra la plantilla, qué manda el DESIGN_SYSTEM, y prohíbe el retroceso explícito.
  const st = styleOf(dna.style)
  const styled = (dna.style ?? DEFAULT_STYLE) !== DEFAULT_STYLE
  const persona = talentImageAttached
    ? zoneFraming
      // La plantilla curada muestra un retrato; la placa adjunta muestra la zona. Sin decir cuál
      // de las dos manda el encuadre, el modelo sigue a la plantilla y vuelve a poner una cara.
      ? `Penúltima = placa del talento encuadrada en ${zoneFraming} (misma persona: mismo tono de piel, complexión y ropa). ⚠️ ESE ENCUADRE MANDA sobre el de la plantilla: la plantilla muestra un retrato, esta pieza NO — no devuelvas el rostro al cuadro para parecerte a ella.`
      : 'Penúltima = retrato del talento (misma persona: cara, pelo, ropa idénticos).'
    : 'No hay imagen de talento adjunta; NO reintroduzcas ninguna persona que la instrucción no pida.'
  return [
    'REFERENCIAS ADJUNTAS (orden) —',
    'Imagen 1 = envase canónico (fidelidad EXACTA de forma y labels). Siguientes = fotos reales del producto.',
    persona,
    'ÚLTIMA = PLANTILLA DE COMPOSICIÓN (fuente de verdad de ESTRUCTURA): reproduce EXACTAMENTE su composición, distribución de zonas, geometría y anatomía de tarjetas (radio de esquina, proporciones, disposición), encuadre y jerarquía. La ESTRUCTURA manda la plantilla. Cambia SOLO lo que esta instrucción indica: producto, cara del talento, copy, color, acabado/material de las superficies, luz y props/partículas del nicho. NO copies de la plantilla su producto, marca, textos, ni props/persona de otro nicho.',
    ...(styled
      ? [
          `⚠️ ACABADO ≠ ESTRUCTURA: la plantilla adjunta está armada con acabado de VIDRIO ESMERILADO (cards translúcidas con glow y borde blanco, iconos esféricos 3D glossy), pero esta pieza es de acabado «${st.name}». De la plantilla tomá SOLO la estructura y la geometría (zonas, encuadre, radio de esquina, proporciones, anatomía de las tarjetas); el MATERIAL y el acabado los manda el DESIGN_SYSTEM de arriba. NO devuelvas las cards al vidrio esmerilado ni los iconos a esferas glossy para parecerte a la plantilla — es criterio de fallo.`,
          // ⚠️ CARVE-OUT DE LUZ — ESCRITO, PROBADO EN PÍXELES, Y **NO FUNCIONA**. No lo cites como
          // mecanismo que anda. La medición (sesión bbbdb4c2, sección beneficios, `bold_impact`):
          // 4 renders — 2 con este carve-out y 2 más cambiándole el halo a `backlight` y a `none` —
          // y en los 4 la escena salió igual de clara y difusa que la plantilla: sin viñeta, sin
          // sombras duras, sin contraste. El halo NO era el bloqueo.
          //
          // Por qué la luz se resiste donde el MATERIAL sí cedió: el material solo lo muestra la
          // plantilla, y contra ella el carve-out gana. La luz, en cambio, la llevan también el
          // ENVASE CANÓNICO y el RETRATO DEL TALENTO — dos assets que el mismo prompt manda
          // reproducir con fidelidad exacta ("mismo objeto de la Imagen 1", "misma persona: cara,
          // pelo, ropa idénticos"). Los dos están fotografiados con luz suave sobre fondo pálido, y
          // el modelo conserva su iluminación porque se le ordenó conservarlos. Un carve-out contra
          // la plantilla no toca esa fuente. Mover la luz de verdad pide re-iluminar esos assets
          // por estilo, que es otro trabajo y otro costo.
          //
          // Se conserva —en vez de borrarlo— porque el texto es correcto y barato, y la medición es
          // sobre UNA sesión cuyos assets son suaves; una con talento de luz dura podría responder.
          // Pero hoy es intención declarada, no efecto verificado.
          `⚠️ LUZ Y CONTRASTE ≠ ESTRUCTURA: la plantilla adjunta está iluminada con luz difusa y suave de estudio, fondo parejo y sombras apenas visibles. Esta pieza NO usa esa luz — usa esta: ${st.light} Y este fondo: ${st.background} Eso cambia respecto de la plantilla la DUREZA de las sombras, el CONTRASTE general y la presencia o ausencia de viñeta. De la plantilla tomá el encuadre y dónde va cada elemento; su ILUMINACIÓN no se copia. Igualar la luz suave y pareja de la plantilla es criterio de fallo.`,
        ]
      : []),
    // Las 8 plantillas curadas están armadas sobre fondo CLARO. Sin esta línea, una pieza de modo
    // oscuro sale clara igual: la difusión sigue la tonalidad de la referencia por encima de los
    // hex de la instrucción. Separa explícitamente ESTRUCTURA (de la plantilla) de TONALIDAD (del
    // DESIGN_SYSTEM). Es la mitigación del riesgo conocido de la decisión #9.
    ...(dark
      ? ['⚠️ TONALIDAD ≠ ESTRUCTURA: la plantilla adjunta tiene fondo CLARO, pero esta pieza es de MODO OSCURO. De la plantilla tomá SOLO la estructura (zonas, encuadre, anatomía, proporciones); la tonalidad la manda el DESIGN_SYSTEM de arriba. NO aclares el fondo para parecerte a la plantilla — el fondo, las cards y las bandas van OSCUROS con texto claro encima.']
      : []),
  ].join('\n')
}

// ─── Secciones/notas auxiliares (reusadas sin cambios funcionales) ───────────

// Secciones que reservan la banda inferior de métodos de pago en el prompt. El overlay de logos
// reales (PaymentBar) se retiró post-smoke, pero el prompt sigue pidiendo la banda como estaba.
export const PAYMENT_SECTIONS: Set<SectionType> = new Set(['oferta', 'garantia'])

// Secciones que muestran un PACK de varias unidades (no un solo frasco). La ruta les pasa el pack
// pre-compuesto (buildProductPack) como Image 1 y este builder inyecta packNote.
export const MULTI_UNIT_SECTIONS: Set<SectionType> = new Set(['oferta', 'cta-final'])

// Secciones que CONSUMEN los tiers de la oferta: `oferta` los pinta enteros (offerText) y
// hero/cta-final el destacado (featuredPriceText + urgencyText). El route se apoya en este set para
// asegurar que `session.offer` exista ANTES de renderizarlas — sin tiers la difusión inventa el
// precio, y siempre el mismo.
export const OFFER_SECTIONS: Set<SectionType> = new Set(['oferta', 'hero', 'cta-final'])

// Secciones que llevan la barra de confianza inferior (mismas 4 filas, composición idéntica; solo
// cambia el color de fondo). Oferta y antes-despues NO la llevan (payment_row / closing_strip).
export const TRUST_BAND_SECTIONS: Set<SectionType> = new Set(['hero', 'beneficios', 'testimonios', 'faq', 'garantia', 'cta-final'])

// Nota de pack: refuerza que las N unidades comparten el label IDÉNTICO de Image 1. End-weighted
// junto al resto de reglas de fidelidad. La escena re-dibuja el pack; esto acota la variación.
function packNote(units: number): string {
  return `MULTI-UNIT PACK: Image 1 is a REFERENCE PACK showing ${units} copies of the SAME single product side by side. Render exactly ${units} units of THIS product as a tight cluster/pack, and copy the IDENTICAL printed label from Image 1 onto every single unit — same wordmark, same secondary text, same colours on all ${units}; never garble, shorten or vary the label from one unit to the next.`
}

// Antes/después ADAPTATIVO por nicho (Task 5): la plantilla de `antes-despues` viene armada sobre
// un acné→piel-limpia genérico, pero la tool es multi-nicho (café, rodillera, limpieza del
// hogar...). Esta nota fuerza dos estados coherentes con el nicho + copy, nunca un "acné" fijo.
// `nicheLabel` (de NICHE_LABELS, vía `nicheId`) ancla el dominio cuando se conoce la categoría —
// sin él, el modelo igual debe inferir el par ANTES/DESPUÉS del copy/producto, solo que sin el
// ancla explícita de categoría.
function beforeAfterNote(hasTalent: boolean, nicheLabel?: string, bodyFocus?: BodyFocus): string {
  // La ZONA manda sobre la categoría. Antes esta nota decía "el mismo ROSTRO ya resuelto" para
  // cualquier producto: en una rodillera o una creatina de glúteos, los dos paneles salían siendo
  // caras. El par ANTES/DESPUÉS solo prueba algo si muestra la parte del cuerpo que el producto
  // cambia — y es la única sección donde ese encuadre es, además, el argumento de venta.
  const zona = bodyFocus ? BODY_FOCUS_FRAMING[bodyFocus] : undefined
  return [
    (nicheLabel ? `Para un producto de categoría «${nicheLabel}», ` : '') +
      'ANTES/DESPUÉS ADAPTATIVO: los dos paneles muestran el MISMO sujeto en dos estados coherentes con el nicho y el copy —',
    hasTalent
      ? zona
        ? `los DOS paneles encuadran ${zona}, en el MISMO ángulo y la misma distancia: el estado ANTES muestra esa zona con el problema visible y el DESPUÉS la misma zona ya resuelta. Misma persona, mismo encuadre en ambos paneles — no cambies de parte del cuerpo entre uno y otro, ni sustituyas la zona por un rostro.`
        : 'el estado ANTES = el/la protagonista con el problema del nicho visible (piel: brotes; movilidad: rigidez; etc.); el estado DESPUÉS = el mismo rostro ya resuelto. Misma persona en ambos paneles.'
      : 'el estado ANTES = superficie/objeto/situación con el problema del nicho; el estado DESPUÉS = el mismo con el resultado logrado.',
    'Nunca inventes una condición de otro nicho ni actúes sufrimiento explícito.',
  ].join('\n')
}

// Urgencia data-driven ($0, honesta): se renderiza como un badge dorado con la línea de urgencia
// del copy (nunca inventada). offerText ya la inyecta en oferta; esto la lleva a hero/cta-final.
function urgencyText(offer: Offer): string {
  return `URGENCY: render a single metallic-gold urgency badge carrying EXACTLY this text and nothing else: "${offer.urgency}". Do not repeat it elsewhere or invent any other urgency line, stock count or deadline.`
}

// Precio destacado para hero/cta-final: sin él, la difusión INVENTA un precio/moneda. Inyecta la
// cifra EXACTA del tier destacado (la oferta vive en la sesión).
function featuredPriceText(offer: Offer): string {
  const f = offer.tiers.find((t) => t.featured) ?? offer.tiers[0]
  const bits = [
    `the pack label "${f.label}"`,
    `the price EXACTLY "${f.price}"`,
    f.priceBefore ? `a struck-through "Antes: ${f.priceBefore}"` : null,
    f.perUnit ? `fine print "${f.perUnit}"` : null,
  ].filter(Boolean).join(', ')
  return `FEATURED PRICE — the price block shows ONLY the featured offer: ${bits}. Use these EXACT figures with the "S/" currency symbol; NEVER invent a price, a "$" amount, a decimal or a pack name.`
}

function offerText(offer: Offer): string {
  const lines = offer.tiers.map((t) => {
    const bits = [
      `"${t.label}"`,
      t.priceBefore ? `antes ${t.priceBefore} (tachado)` : null,
      `precio ${t.price}`,
      t.perUnit ? `(${t.perUnit})` : null,
      typeof t.savingsPct === 'number' ? `ahorra ${t.savingsPct}%` : null,
      `botón "${t.cta}"`,
      t.featured ? 'ESTE es el tier DESTACADO → va en el slot central elevado de la plantilla' : null,
    ].filter(Boolean).join(', ')
    return `  - ${bits}`
  }).join('\n')
  return `PRICE TIERS — coloca EXACTAMENTE estos ${offer.tiers.length} tiers en las columnas de precio de la plantilla, uno por columna y NINGUNO más. La PLANTILLA ya define la disposición de las 3 columnas, cuál va elevada al centro, la corona/cinta dorada "Recomendado"/"Mejor valor" y el estilo de cada botón — reprodúcela tal cual; esta instrucción solo aporta los DATOS (etiquetas, precios, ancla tachada, ahorro %, precio por unidad, texto del botón). El tier marcado DESTACADO va en el slot central elevado:\n${lines}${offer.urgency ? `\n  Badge de urgencia arriba con EXACTAMENTE este texto y nada más: "${offer.urgency}".` : ''}`
}

// Barra de confianza: los HECHOS (data). La COMPOSICIÓN la manda la plantilla — este texto ya no
// describe "frosted pill" ni forma alguna (eso hacía que hero saliera con pills y beneficios con
// banda sólida). La barra es IDÉNTICA en todas las secciones que la tienen; lo único que cambia
// entre secciones es el color de fondo de la banda (re-tinte).
function trustText(trust: TrustBlock, money: MoneyRamp): string {
  const rows: string[] = []
  if (trust.coverage?.length) rows.push(`Envío a domicilio en ${trust.coverage.join(' y ')}${trust.freeShipping ? ' (envío gratis)' : ''}`)
  if (trust.deliveryTime) rows.push(`Entrega en ${trust.deliveryTime}`)
  if (trust.codDelivery) rows.push('Pago contraentrega — pagas en efectivo cuando llega')
  if (trust.guaranteeDays) rows.push(`Compra 100% segura${trust.guaranteeText ? ` — ${trust.guaranteeText}` : ` — garantía de ${trust.guaranteeDays} días`}`)
  if (!rows.length) return ''
  // La banda ya NO se re-tinta por sección (pedido del usuario, 2026-08-07): es metálica y
  // ABSOLUTAMENTE la misma en las 6 secciones que la llevan. Antes el color de fondo era "lo único
  // que variaba" entre secciones, y esa variación era justo lo que rompía la sensación de que la
  // barra es un elemento fijo del funnel. Ojo: esto AGREGA la banda a la lista de usos del metal
  // del DESIGN_SYSTEM — las dos líneas tienen que decir lo mismo o el prompt se contradice.
  return `TRUST BAR — reproduce EXACTAMENTE la banda de confianza de la plantilla, IDÉNTICA en composición a la de las demás secciones (una sola franja horizontal al pie, con estos ítems en una fila pareja: ícono + título bold + línea más ligera). NO cambies su disposición, orden, cantidad de ítems ni forma entre secciones.
COLOR DE LA BANDA (invariante, NO se re-tinta): la franja es SIEMPRE un degradado metálico ${money.name} de ${money.dark} a ${money.light}, con acabado de lámina pulida y un brillo suave que la recorre. EXACTAMENTE el mismo color y acabado en TODAS las secciones — no lo adaptes a la marca, al fondo ni a la sección. El texto y los iconos sobre la banda van en ${money.on} para que se lean sobre el metal.
Usa EXACTAMENTE estos hechos, no inventes ninguno:\n${rows.map((r) => `  - ${r}`).join('\n')}`
}

// Reserva la banda inferior de métodos de pago. Garantía deja la banda limpia y puede rotular
// "Paga como prefieras". (El overlay de logos reales se retiró post-smoke.)
//
// ⚠️ `garantia` está en PAYMENT_SECTIONS **y** en TRUST_BAND_SECTIONS, así que las dos
// instrucciones hablan del pie a la vez. Desde que la banda de confianza es metálica invariante
// (2026-08-07) eso se volvió una contradicción abierta ("franja metálica dorada" vs "franja limpia
// y calma"), así que esta nota ya NO describe el aspecto del pie: solo prohíbe los logos y le cede
// el tratamiento visual a la banda de confianza.
const PAYMENT_BAND =
  'PAYMENT LOGOS (do NOT draw): the BOTTOM ~12% of the image must contain NO payment logos, card icons, brand marks, wallet logos, country flags or the words "yape/visa/mastercard/mercado pago" anywhere. This rule is only about logos — the look of that bottom strip is governed by the TRUST BAR instruction if this section has one, and is otherwise a calm strip in the piece\'s own tonality. You MAY render a short heading like "Paga como prefieras" just ABOVE it, but no logos.'

const PAYMENT_BRAND: Record<PaymentMethod, string> = {
  yape: 'Yape', plin: 'Plin', mercadopago: 'Mercado Pago', visa: 'Visa',
  mastercard: 'Mastercard', efectivo: 'Efectivo', transferencia: 'Transferencia',
}
// Oferta: el modelo DIBUJA los logos exactos elegidos por el usuario (decisión 2026-07-23),
// como en la plantilla. Localizable por país vía la lista que arma el usuario en el wizard.
function paymentLogosText(methods: PaymentMethod[]): string {
  const names = methods.map((m) => PAYMENT_BRAND[m]).join(', ')
  return `PAYMENT LOGOS (DRAW them): in the BOTTOM ~12% band, under a short heading like "Paga como prefieras", render a neat single row of the payment brand marks for EXACTLY these methods and no others: ${names}. Use each brand's recognizable logo/wordmark, evenly spaced, crisp and legible; do not invent other payment brands or add ones not listed.`
}

// Reserva la franja superior para el lockup de marca (compuesto aparte, no dibujado).
const LOCKUP_BAND =
  'BRAND LOCKUP (do NOT draw): keep the very TOP ~6% center strip clean and empty — a small crisp brand wordmark lockup is composited there afterwards. Do NOT render any logo, wordmark, brand name or badge in that top strip yourself; start the headline below it.'

// ─── Ensamblador principal ───────────────────────────────────────────────────
export function buildDiffusionInstruction(args: {
  section: SectionType
  copy: SectionCopy
  dna: LandingDna
  productLabels: string | null
  offer?: Offer | null
  trust?: TrustBlock | null
  packUnits?: number | null
  hasTalent: boolean            // false solo si demographic_id === 'no_talent'
  talentSubstitute?: string     // NO_TALENT_SUBSTITUTE[niche] cuando !hasTalent
  reserveLockup?: boolean
  nicheId?: NicheId             // session.niche_id — ancla antes-despues a la categoría del nicho
  demographicLabel?: string     // DEMOGRAPHIC_LABELS[demographic_id] — restringe caras de testimonios
  bodyFocus?: BodyFocus         // session.body_focus — la zona sobre la que actúa el producto
  zonePlate?: boolean           // true si la placa ADJUNTA es la de zona (todo menos el hero)
}): string {
  const { section, copy, dna, productLabels, offer, trust, packUnits, hasTalent, talentSubstitute, reserveLockup, nicheId, demographicLabel, bodyFocus, zonePlate } = args

  // El talento/protagonista se muestra solo si el nicho lo tiene Y la sección no está en
  // NO_TALENT_SECTIONS (faq/testimonios/garantia/cta-final). Determina si se adjunta el retrato
  // (nota de plantilla).
  const talentImageAttached = hasTalent && !NO_TALENT_SECTIONS.has(section)

  // Una sola rampa de metal para toda la instrucción: la comparten el DESIGN_SYSTEM y la banda de
  // confianza. Si cada uno la calculara por su cuenta, un cambio en `moneyRamp` podría dejarlas
  // diciendo colores distintos y el prompt se contradiría solo.
  const money = moneyRamp(dna.palette)

  const base = [
    'Diseña UNA sección de landing 9:16 full-bleed, calidad de anuncio comercial premium, mobile-first. La ÚLTIMA imagen adjunta es la PLANTILLA DE COMPOSICIÓN — reproduce EXACTAMENTE su composición y estructura; esta instrucción solo cambia producto, talento, copy, colores, acabado/material y props del nicho.',
    brandBlock(productLabels),
    designSystemBlock(dna, money),
    masterLayoutBlock(dna, section, hasTalent, talentSubstitute, demographicLabel, bodyFocus, zonePlate),
    compositionReinforcementBlock(section),
    '',
    'Copy a renderizar (y SOLO este copy):',
    copyBlock(copy),
    '',
    TEXT_RULES,
    templateNote(talentImageAttached, dna.palette.polarity === 'dark', dna, zonePlate && bodyFocus ? BODY_FOCUS_FRAMING[bodyFocus] : undefined),
  ]

  const extra: string[] = []
  if (section === 'antes-despues') extra.push(beforeAfterNote(hasTalent, nicheId ? NICHE_LABELS[nicheId] : undefined, bodyFocus))
  if (section === 'oferta' && offer) extra.push(offerText(offer))
  // Precio + urgencia en hero/cta-final: la cifra EXACTA del tier destacado y el badge único con la
  // línea del copy (oferta ya trae ambos en offerText). Sin esto, hero/cta inventan precio y moneda.
  if (offer && (section === 'hero' || section === 'cta-final')) extra.push(featuredPriceText(offer))
  if (offer?.urgency && (section === 'hero' || section === 'cta-final')) extra.push(urgencyText(offer))
  if (trust && TRUST_BAND_SECTIONS.has(section)) extra.push(trustText(trust, money))
  if (packUnits && packUnits > 1) extra.push(packNote(packUnits))
  if (reserveLockup) extra.push(LOCKUP_BAND)
  if (section === 'oferta' && trust?.paymentMethods?.length) extra.push(paymentLogosText(trust.paymentMethods))
  else if (PAYMENT_SECTIONS.has(section)) extra.push(PAYMENT_BAND)

  return [...base, ...extra].filter(Boolean).join('\n\n')
}
