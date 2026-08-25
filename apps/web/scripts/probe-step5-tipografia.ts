// ¿El instructivo de STEP5 conserva la TIPOGRAFÍA de la referencia y deja pasar solo el color?
// Es texto puro (una llamada a `callReasoning`), no genera ninguna imagen ni gasta cuota de imagen.
//   npx tsx --env-file=.env.local scripts/probe-step5-tipografia.ts
import { callReasoning, STEP5_PROMPT } from '../lib/gemini'

const CTX = [
  `=== REFERENCE ANALYSIS ===`,
  `Format: 4:5 — instagram`,
  `Layout: titular arriba, producto al centro, CTA abajo`,
  `Composition: frasco sobre mármol, titular en dos líneas`,
  `Style: fotografía publicitaria limpia`,
  `Typography: titular en serif de alto contraste, versalitas, tracking amplio, alineado al centro,`,
  `  con una fina línea dorada debajo; subtítulo en sans grotesca ligera, caja baja, alineado al centro,`,
  `  a la mitad del tamaño del titular; CTA en sans bold, MAYÚSCULAS, dentro de una píldora redondeada.`,
  `Colorimetry: fondo crema #F2E9DC, titular verde oliva #4A5D23, CTA naranja #E8722C`,
  `Persuasive logic: autoridad y prestigio`,
  `Creative concept: lista de beneficios sobre un bodegón de producto`,
  ``,
  `=== PRODUCT SCAN ===`,
  `Product: frasco de vidrio ámbar con gotero`,
  `Branding: SERUM DE NIACINAMIDA · 30 ml`,
  `Brand colors: #1E0811 (dominante), #BD1347 (acento), #F6F2EB (claro)`,
  ``,
  `=== BRIEF ===`,
  `Product name: Claria`,
  `What it does: atenúa las marcas del acné`,
  `Target audience: Mujeres de 20-35`,
  ``,
  `=== CONFIRMED COPY ===`,
  `headline: "Tu piel, sin marcas"`,
  `subhead: "niacinamida pura, todas las noches"`,
  `cta: "LO QUIERO"`,
].join('\n')

/**
 * ⚠️ ESTA SONDA IMPRIME, NO PUNTÚA — y es a propósito. La primera versión tenía checks por palabra
 * clave y daba falsos negativos entre corridas: el modelo dice el MISMO hecho de tres formas
 * distintas ("exactly 50% of the headline size", "half the size of the headline", "50% scale of
 * headline"). Un ❌ ahí no mide el instructivo, mide la regex — y haría creer que el candado
 * tipográfico no funciona cuando sí. Lo que vale es leer el bloque: la FORMA tiene que ser la de la
 * referencia y lo único distinto, el color.
 */
async function main() {
  const out = await callReasoning(STEP5_PROMPT, CTX, { preferGemini: true })

  // Único check robusto a la redacción: que el recoloreo haya ocurrido con los hex de la MARCA.
  const marca = ['#1E0811', '#BD1347', '#F6F2EB'].filter((h) => out.toUpperCase().includes(h))
  console.log(`hex de marca en el instructivo: ${marca.length ? marca.join(' ') : 'NINGUNO ⚠️'}`)
  // Los hex de la REFERENCIA aparecen a propósito: §5 exige declarar el mapeo uno por uno
  // ("CTA fill #1E0811 (was red)"), así que el viejo va del lado del "was". Que estén no es un
  // problema; lo sería que un elemento TERMINE con uno, y eso hay que leerlo, no grepearlo.

  const lineas = out.split('\n')
  const i = lineas.findIndex((l) => /typograph|tipograf/i.test(l))
  console.log('\n--- bloque de tipografía, para leerlo ---')
  console.log(i >= 0 ? lineas.slice(i, i + 8).join('\n') : '(no lo nombró — eso sí es un problema)')
}
main().catch((e) => { console.error(e); process.exit(1) })
