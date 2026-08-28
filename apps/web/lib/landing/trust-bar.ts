import { Resvg } from '@resvg/resvg-js'
import { join } from 'node:path'
import sharp from 'sharp'
import type { TrustBlock } from './types'
import type { MoneyRamp } from './palette-derive'

/**
 * LA BARRA DE CONFIANZA SE COMPONE EN CÓDIGO, NO LA DIBUJA EL MODELO.
 * ---------------------------------------------------------------------------
 * ⚠️ **ESTO EXISTE PORQUE EL PROMPT NO PUDO, Y ESTÁ MEDIDO EN TRES RONDAS.** La barra tiene
 * que ser el MISMO elemento en las 6 secciones que la llevan — es el pedido explícito del
 * dueño del repo y la razón de que exista—, y hay un test que fija que el bloque de texto que
 * la describe es literalmente el mismo string en las 6. Aun así, sobre una corrida real de las
 * 8 secciones salieron: tres barras doradas, una NEGRA (faq), una negra con filos dorados
 * (testimonios) y una en dos filas sin iconos (garantía), con la pastilla distinta en las seis.
 *
 * La causa es la ley que este repo ya midió con la luz, el encuadre y el escenario: **contra
 * una imagen adjunta que muestra otra cosa, el texto pierde**. La plantilla curada trae la
 * banda en AZUL; pedirle al modelo que la repinte de dorado es una negociación, y la resuelve
 * distinto cada vez. Una cuarta ronda de prompt sería insistir con un método ya medido.
 *
 * Componerla elimina la negociación: se dibuja encima, así que **no depende de que el modelo
 * obedezca**. Lo que el modelo haya puesto en esa franja queda tapado.
 *
 * ⚠️ **EL TEXTO SE RASTERIZA CON UNA FUENTE EMPAQUETADA, NO CON LA DEL SISTEMA.** `sharp` y su
 * render de SVG resuelven tipografías por fontconfig, y en el runtime de Vercel prácticamente
 * no hay fuentes: el texto saldría en blanco o con una sustituta arbitraria. `resvg` acepta los
 * archivos de fuente por ruta y `loadSystemFonts: false` garantiza que use SOLO ésos, así que
 * el resultado es idéntico en local y en producción. Lato es la fuente de cuerpo de la marca
 * (BRANDBOOK) y es OFL, así que se puede distribuir con el repo.
 */

// Alto de la franja como fracción de la altura de la pieza. Medido sobre las plantillas
// curadas: la banda ocupa ~7% y la pastilla vive justo debajo, dentro del 12% inferior.
const ALTO_BANDA = 0.085
const ALTO_PASTILLA = 0.050

/**
 * Lo que el prompt le pide al modelo que deje libre. Es un poco MÁS que lo que se compone, para
 * que su propia banda —si igual la dibuja— quede enteramente debajo del composite en vez de
 * asomar por arriba. Medido: con el 12 % justo, la banda de la sección se veía sobre la nuestra.
 */
export const RESERVA_PIE = 0.16

// Iconos: paths de lucide (misma familia que usa el resto del hub), normalizados a viewBox 24.
const ICONOS: Record<string, string> = {
  envio: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M14 9h4l4 4v4a1 1 0 0 1-1 1h-1M9 18h6M7.5 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM21.5 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  entrega: 'M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  pago: 'M2 7h20v10H2zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 10v.01M18 14v.01',
  seguro: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  experto: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4',
}

export type ItemConfianza = { icono: keyof typeof ICONOS; titulo: string; detalle?: string }

/**
 * Los HECHOS de la barra, en el mismo orden en el que la plantilla los muestra.
 * ⚠️ Es la MISMA derivación que usaba el prompt: se movió acá para que el texto compuesto y
 * cualquier instrucción que hable de la barra no puedan divergir.
 */
export function itemsDeConfianza(t: TrustBlock): ItemConfianza[] {
  const items: ItemConfianza[] = []
  if (t.coverage?.length)
    items.push({ icono: 'envio', titulo: `Envío a domicilio en ${t.coverage.join(' y ')}`, detalle: t.freeShipping ? 'Envío gratis' : undefined })
  if (t.deliveryTime) items.push({ icono: 'entrega', titulo: `Entrega en ${t.deliveryTime}` })
  if (t.codDelivery) items.push({ icono: 'pago', titulo: 'Pago contraentrega', detalle: 'Pagas en efectivo cuando llega' })
  if (t.guaranteeDays)
    items.push({ icono: 'seguro', titulo: 'Compra 100% segura', detalle: t.guaranteeText || `Garantía de ${t.guaranteeDays} días` })
  return items
}

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/**
 * Ancho medio de un glifo de Lato como fracción del tamaño de fuente. Sirve para decidir
 * saltos de línea sin medir glifos de verdad.
 * ponytail: el peor caso de una estimación es una línea un poco corta; medir glifos pediría
 * parsear la fuente para algo que no lo justifica.
 */
const ANCHO_GLIFO = 0.50

function partir(texto: string, anchoDisp: number, fuente: number, maxLineas: number): string[] {
  const max = Math.max(6, Math.floor(anchoDisp / (fuente * ANCHO_GLIFO)))
  const out: string[] = ['']
  for (const p of texto.split(' ')) {
    const cand = out[out.length - 1] ? `${out[out.length - 1]} ${p}` : p
    if (cand.length <= max || !out[out.length - 1]) out[out.length - 1] = cand
    else if (out.length < maxLineas) out.push(p)
    else { out[out.length - 1] += ` ${p}`; break }
  }
  return out
}

function svgBanda(a: {
  ancho: number; alto: number; altoPastilla: number
  items: ItemConfianza[]; money: MoneyRamp; oscuro: boolean
}): string {
  const { ancho, alto, altoPastilla, items, money, oscuro } = a
  const n = Math.max(items.length, 1)
  const col = ancho / n
  const tinta = money.on

  // ⚠️ EL ICONO Y EL TEXTO SON DOS CARRILES, NO UNA CAJA CENTRADA. La primera versión centraba
  // el texto en la columna y ponía el icono al 10 %: se pisaban ("Entrega en 24/48" encima del
  // reloj) y el último título se salía del borde ("Compra 100% segur"). Con el texto alineado a
  // la izquierda del icono, el ancho disponible es una cuenta y no una esperanza.
  const pad = col * 0.055
  const iconoTam = Math.min(alto * 0.34, col * 0.16)
  const gap = col * 0.045
  const textoX = pad + iconoTam + gap
  const anchoTexto = col - textoX - pad
  const fuente = Math.min(alto * 0.175, anchoTexto * 0.115)
  const interlinea = fuente * 1.12

  const columnas = items.map((it, i) => {
    const x = col * i
    const titulo = partir(it.titulo, anchoTexto, fuente, 2)
    const detalle = it.detalle ? partir(it.detalle, anchoTexto, fuente * 0.82, 2) : []
    const altoBloque = titulo.length * interlinea + detalle.length * interlinea * 0.82
    // Baseline de la primera línea: el bloque va centrado vertical en la banda.
    let y = (alto - altoBloque) / 2 + fuente * 0.86

    const tTitulo = titulo.map((l) => {
      const t = `<text x="${x + textoX}" y="${y}" font-family="Lato" font-weight="700" font-size="${fuente}" fill="${tinta}">${escapar(l)}</text>`
      y += interlinea
      return t
    }).join('')
    const tDetalle = detalle.map((l) => {
      const t = `<text x="${x + textoX}" y="${y}" font-family="Lato" font-weight="400" font-size="${fuente * 0.82}" fill="${tinta}" fill-opacity="0.9">${escapar(l)}</text>`
      y += interlinea * 0.82
      return t
    }).join('')

    // Divisor a la izquierda de cada columna menos la primera: es lo que da la lectura de "una
    // sola fila pareja" que la plantilla muestra y el modelo perdía.
    const divisor = i === 0 ? '' : `<line x1="${x}" y1="${alto * 0.18}" x2="${x}" y2="${alto * 0.82}" stroke="${tinta}" stroke-opacity="0.32" stroke-width="${Math.max(1, ancho * 0.0011)}"/>`
    const icono = `<g transform="translate(${x + pad} ${(alto - iconoTam) / 2}) scale(${iconoTam / 24})"><path d="${ICONOS[it.icono]}" fill="none" stroke="${tinta}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></g>`
    return divisor + icono + tTitulo + tDetalle
  }).join('')

  const total = alto + altoPastilla
  const pastillaAlto = altoPastilla * 0.60
  const pFuente = pastillaAlto * 0.40
  const pIcono = pastillaAlto * 0.52
  const texto = 'RECOMENDADO POR EXPERTOS'
  const pastillaAncho = Math.min(ancho * 0.66, texto.length * pFuente * 0.60 + pIcono + pastillaAlto * 1.6)
  const pastillaX = (ancho - pastillaAncho) / 2
  const pastillaY = alto + (altoPastilla - pastillaAlto) / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${total}" viewBox="0 0 ${ancho} ${total}">
  <defs>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${money.dark}"/><stop offset="28%" stop-color="${money.light}"/>
      <stop offset="52%" stop-color="${money.dark}"/><stop offset="76%" stop-color="${money.light}"/>
      <stop offset="100%" stop-color="${money.dark}"/>
    </linearGradient>
    <linearGradient id="brillo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.28"/>
      <stop offset="45%" stop-color="#FFFFFF" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.13"/>
    </linearGradient>
  </defs>
  <rect width="${ancho}" height="${total}" fill="${oscuro ? '#141014' : '#F6F5F3'}"/>
  <rect width="${ancho}" height="${alto}" fill="url(#metal)"/>
  <rect width="${ancho}" height="${alto}" fill="url(#brillo)"/>
  ${columnas}
  <g>
    <rect x="${pastillaX}" y="${pastillaY}" width="${pastillaAncho}" height="${pastillaAlto}" rx="${pastillaAlto / 2}" fill="url(#metal)"/>
    <rect x="${pastillaX}" y="${pastillaY}" width="${pastillaAncho}" height="${pastillaAlto}" rx="${pastillaAlto / 2}" fill="url(#brillo)"/>
    <g transform="translate(${pastillaX + pastillaAlto * 0.55} ${pastillaY + (pastillaAlto - pIcono) / 2}) scale(${pIcono / 24})"><path d="${ICONOS.experto}" fill="none" stroke="${tinta}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>
    <text x="${pastillaX + pastillaAlto * 0.55 + pIcono + pastillaAlto * 0.4}" y="${pastillaY + pastillaAlto * 0.65}" font-family="Lato" font-weight="700" font-size="${pFuente}" fill="${tinta}" letter-spacing="${pFuente * 0.05}">${texto}</text>
  </g>
</svg>`
}

// ⚠️ RUTAS, no buffers: esta versión de resvg solo acepta `fontFiles`. Los .ttf viven en el
// repo (`assets/fonts/`) y `next.config.ts` los declara en `outputFileTracingIncludes`, porque
// son archivos de datos que ningún `require` menciona — el trazador de Vercel los dejaría fuera
// y el texto saldría sin fuente. Es la misma lección que el binario de ffmpeg.
const FUENTES = ['Lato-Regular.ttf', 'Lato-Bold.ttf'].map((f) => join(process.cwd(), 'assets/fonts', f))

/**
 * Pega la barra de confianza sobre el pie de una sección ya generada.
 *
 * ⚠️ Es una superposición OPACA: cubre lo que el modelo haya dibujado en esa franja. Ésa es
 * justamente la garantía — no depende de que haya obedecido la instrucción de dejarla libre.
 */
export async function componerBarraConfianza(
  imagen: Buffer,
  trust: TrustBlock,
  money: MoneyRamp,
  oscuro: boolean,
): Promise<Buffer> {
  const items = itemsDeConfianza(trust)
  if (!items.length) return imagen

  const { width, height } = await sharp(imagen).metadata()
  if (!width || !height) return imagen

  const alto = Math.round(height * ALTO_BANDA)
  const altoPastilla = Math.round(height * ALTO_PASTILLA)
  const svg = svgBanda({ ancho: width, alto, altoPastilla, items, money, oscuro })

  const png = new Resvg(svg, {
    // ⚠️ `loadSystemFonts: false` NO es opcional: sin eso resvg cae a lo que haya en el sistema,
    // que en Vercel es casi nada — el texto saldría con otra fuente o directamente vacío. Con la
    // fuente por buffer, local y producción rasterizan idéntico.
    font: { fontFiles: FUENTES, loadSystemFonts: false, defaultFontFamily: 'Lato' },
    fitTo: { mode: 'width', value: width },
  }).render().asPng()

  return sharp(imagen)
    .composite([{ input: png, left: 0, top: height - (alto + altoPastilla) }])
    .png()
    .toBuffer()
}
