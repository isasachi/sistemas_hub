// Probe del instructivo de STEP5: ¿re-apunta los marcadores a la zona del producto y adopta la
// paleta de la marca? Es texto puro (una llamada a `callReasoning`), no genera ninguna imagen y no
// toca cuota de imagen. Se corre a mano:
//   npx tsx --env-file=.env.local scripts/probe-step5-zona.ts
import { callReasoning, STEP5_PROMPT } from '../lib/gemini'

const REF = [
  `=== REFERENCE ANALYSIS ===`,
  `Format: 4:5 — instagram`,
  `Physical position: Está apoyado sobre una mesa de mármol. No está flotando.`,
  `Layout: split vertical, mitad izquierda "antes", mitad derecha "después"`,
  `Composition: dos cuerpos femeninos de perfil | flecha amarilla desde el copy izquierdo hasta el vientre | badge circular abajo a la derecha`,
  `Style: fotografía publicitaria limpia`,
  `Colorimetry: fondo crema #F2E9DC, titular verde oliva #4A5D23, CTA naranja #E8722C`,
  `Typography: sans bold mayúsculas`,
  `Persuasive logic: contraste antes/después`,
  `Scene elements:`,
  `  People: ["mujer 25-35 de perfil con abdomen prominente","la misma mujer de perfil con abdomen plano"]`,
  `  Props: ["flecha amarilla","badge circular"]`,
  `  Brand elements: ["logo SLIMFIT arriba a la izquierda"]`,
  `  Setting: fondo crema liso de estudio`,
]

const PRODUCT = (whatItDoes: string, colors: string) => [
  ``,
  `=== PRODUCT INFO ===`,
  `Product name: Gluteo Gummies`,
  `What it does: ${whatItDoes}`,
  `Target audience: Mujeres de 20-40`,
  `Product description: frasco cilíndrico rosa con tapa dorada, gomitas rosadas`,
  `Branding: GLUTEO GUMMIES · 60 gomitas · sabor frambuesa`,
  `Brand colors: ${colors}`,
  `Logo provided: NO`,
  ``,
  `=== APPROVED COPY ===`,
  `Version A:`,
  `  headline: "Levanta lo que ya tienes"`,
  `  cta: "Pídelas hoy"`,
]

async function main() {
  const casos = [
    {
      nombre: 'A · zona distinta (abdomen → glúteos) + paleta de marca',
      ctx: [
        ...REF,
        `Body zone the reference points at: abdomen`,
        `Attention markers: flecha amarilla que va del copy izquierdo al vientre de la mujer "antes" | contraste antes/después centrado en el vientre`,
        ...PRODUCT('gomitas para aumentar y levantar los glúteos', '#F2799F, #D9A441'),
      ].join('\n'),
    },
    {
      // El riesgo simétrico: re-apuntar un anuncio que ya apuntaba bien.
      nombre: 'C · misma zona (abdomen → abdomen): NO se re-apunta nada',
      ctx: [
        ...REF,
        `Body zone the reference points at: abdomen`,
        `Attention markers: flecha amarilla que va del copy izquierdo al vientre de la mujer "antes" | contraste antes/después centrado en el vientre`,
        ...PRODUCT('cápsulas para reducir la grasa abdominal', '#F2799F, #D9A441'),
      ].join('\n'),
    },
    {
      nombre: 'B · la referencia no señala ninguna zona (control negativo)',
      ctx: [
        ...REF.filter((l) => !l.includes('flecha')),
        `Body zone the reference points at: none — the ad points at no body zone`,
        `Attention markers: none`,
        ...PRODUCT('gomitas para aumentar y levantar los glúteos', 'not detected — keep the reference palette'),
      ].join('\n'),
    },
  ]

  for (const c of casos) {
    const out = await callReasoning(STEP5_PROMPT, c.ctx, { preferGemini: true })
    const low = out.toLowerCase()
    const hits = (re: RegExp) => (out.match(re) ?? []).length
    console.log(`\n${'='.repeat(78)}\n${c.nombre}  (${out.length} car)\n${'='.repeat(78)}`)
    console.log(`  glúteos/glutes/buttocks : ${hits(/glute|buttock|gl[úu]teo/gi)}`)
    console.log(`  abdomen/belly/waist     : ${hits(/abdomen|belly|waist|stomach|vientre/gi)}`)
    console.log(`  re-aim / points at      : ${hits(/re-aim|points? (?:at|to)|aimed at/gi)}`)
    console.log(`  hex de la marca         : ${hits(/#F2799F|#D9A441/gi)}`)
    console.log(`  hex de la referencia    : ${hits(/#F2E9DC|#4A5D23|#E8722C/gi)}`)
    console.log(`  menciona layout intacto : ${low.includes('layout') ? 'sí' : 'no'}`)
    console.log(`\n--- instructivo ---\n${out}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
