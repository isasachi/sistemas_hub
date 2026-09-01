// El ÚNICO paso con LLM del pipeline. Responde lo que el código no puede:
// ¿esto es un producto físico, y es un producto DEL nicho buscado?
//
// Todo lo demás (descubrir, contar anuncios, rangos, share de monoproducto) es
// determinista y ya está resuelto antes de llegar acá. El modelo no ve números
// ni puede cambiarlos: recibe texto y devuelve un enum. Esa es toda su
// superficie.
//
// ⚠️ COSTO: 1 llamada Haiku por candidato, y solo por los que sobrevivieron al
// filtro determinista. Solo en el worker, nunca en Vercel.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { normalize } from './product-key'

export const MODEL = process.env.PH_NICHO_MODEL ?? 'claude-haiku-4-5'

// ⚠️ La pregunta del segundo punto es literal y viene de un fallo medido: un
// cabezal de ducha con 221 anuncios cuyo copy dice "evita caída de pelo,
// irritación de piel, acné" entraba como producto de acné. Mencionar el nicho
// no es pertenecer a él. El mismo caso cubre un suplemento prebiótico que
// promete mejorar la piel y unas plantillas de pádel que hablan de "espinillas".
const SYSTEM = `Decides dos cosas sobre un anuncio de Meta Ads Library.

1. QUÉ SE VENDE:
- "fisico": un objeto tangible que se le envía al comprador (crema, jabón, parches, cápsulas, aparato).
- "digital": software, apps, juegos, suscripciones.
- "contenido": cursos, ebooks, planes, membresías, asesorías informativas.
- "servicio": algo que se presta o se visita (clínicas, spas, limpiezas faciales, láser, delivery, marketplaces sin producto propio).
- "indeterminado": el texto no alcanza.

2. SI EL PRODUCTO PERTENECE AL NICHO BUSCADO.
La prueba no es si el anuncio MENCIONA el nicho, sino si el producto está hecho PARA ese problema.
- Un jabón formulado contra el acné pertenece al nicho "acné".
- Un filtro de ducha que entre sus diez beneficios nombra el acné NO pertenece: está hecho para filtrar agua.
- Un suplemento digestivo que dice mejorar la piel NO pertenece: está hecho para el intestino.
- Un producto para manchas o despigmentación NO pertenece al nicho "acné" aunque lo compre el mismo público.

⚠️ DOS FORMAS DE NO PERTENECER QUE HAY QUE RECHAZAR SIEMPRE:
a) OTRA CATEGORÍA DE NECESIDAD. Si el producto resuelve un problema distinto, no pertenece — aunque el público se solape y aunque comparta el rubro. Un suplemento de remolacha para la circulación NO pertenece al nicho "calcio". Unas cápsulas para dormir NO pertenecen al nicho "colágeno". Si tu propia explicación necesita empezar con "aunque", la respuesta es NO.
b) COINCIDENCIA DE PALABRA. Si el nombre del nicho aparece con OTRO significado, no pertenece. Un short de baño con corte "taper" NO pertenece al nicho "taper"; unas plantillas que alivian el dolor de "espinillas" (el hueso) NO pertenecen al nicho de las espinillas de la piel.

Fuera de esos dos casos, ante la duda razonable responde que SÍ pertenece: perder un producto legítimo es peor que dejar pasar uno dudoso.

3. CITA: copia TEXTUAL un fragmento corto del texto que te dieron y que justifique tu decisión sobre el nicho. Cópialo carácter por carácter, sin reescribirlo. Si no hay ninguno, deja la cita vacía.

4. NOMBRE: el nombre corto del producto, dos o tres palabras, como lo llamaría quien lo vende.

5. DESCRIPCIÓN: UNA línea de 8 a 16 palabras que diga QUÉ ES y PARA QUÉ SIRVE, en español neutro.
- Sale SOLO del texto que te dieron. Si el anuncio no dice de qué está hecho o cuánto trae, no lo inventes.
- Nada de promoción: ni precios, ni "envío gratis", ni "oferta", ni signos de exclamación.
- No empieces con el nombre del producto (ya se muestra arriba); empieza por lo que es.
- Si el texto no alcanza para decir qué es, déjala vacía en vez de rellenarla.`

const VerdictSchema = z.object({
  kind: z.enum(['fisico', 'digital', 'servicio', 'contenido', 'indeterminado']),
  // Opcional con default true: si el modelo lo omite NO se descarta el producto.
  perteneceAlNicho: z.boolean().optional().default(true),
  productName: z.string().optional().default(''),
  // Una línea para la card. Se pide en la MISMA llamada que el veredicto: es un
  // campo más de salida, no una llamada más.
  descripcion: z.string().optional().default(''),
  cita: z.string().optional().default(''),
  motivo: z.string().optional().default(''),
})
export type NichoVerdict = z.infer<typeof VerdictSchema> & { citaVerificada: boolean }

const TOOL: Anthropic.Tool = {
  name: 'registrar_veredicto',
  description: 'Registra qué se vende y si pertenece al nicho buscado.',
  input_schema: z.toJSONSchema(VerdictSchema) as Anthropic.Tool.InputSchema,
}

export interface VerdictInput {
  niche: string
  advertiser: string | null
  productPath: string | null
  textos: string[]
}

/**
 * La cita tiene que existir LITERAL en el texto que se le pasó al modelo.
 * Es la verificación en código de la única salida en prosa: si el modelo la
 * inventa, el veredicto queda sin respaldo y la fila va a revisión en vez de
 * publicarse. Se compara normalizado (sin acentos ni mayúsculas) porque el
 * modelo reescribe tildes al copiar, no porque se acepte una paráfrasis.
 */
export function citaRespaldada(cita: string, textos: string[]): boolean {
  const c = normalize(cita).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (c.length < 8) return false
  const fuente = normalize(textos.join(' ')).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')
  return fuente.includes(c)
}

// Las tres piezas de abajo las comparten los DOS transportes. Están extraídas y
// no duplicadas por el mismo motivo que el SYSTEM: dos preparaciones distintas
// del mismo texto darían dos veredictos distintos sobre la misma fila.

/** Quita las plantillas sin renderizar y se queda con lo que dice algo. */
export function limpiarTextos(textos: string[]): string[] {
  return textos.map((t) => t.replace(/\{\{[^}]*\}\}/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 12).slice(0, 12)
}

/** Sin texto no hay veredicto — y NO se gasta una llamada en averiguarlo. */
export function sinTexto(): NichoVerdict {
  return {
    kind: 'indeterminado', perteneceAlNicho: true, productName: '', descripcion: '',
    cita: '', motivo: 'el anuncio no trae texto real', citaVerificada: false,
  }
}

function mensajeDe(input: VerdictInput, textos: string[]): string {
  return `Nicho buscado: "${input.niche}"\n` +
    `Anunciante: "${input.advertiser ?? '(sin nombre)'}"\n` +
    `URL del producto: ${input.productPath ?? '(no hay)'}\n\n` +
    `Textos de sus anuncios de ese producto:\n${textos.map((t) => `· ${t}`).join('\n')}`
}

export async function juzgarNicho(ai: Anthropic, input: VerdictInput): Promise<NichoVerdict> {
  const textos = limpiarTextos(input.textos)
  if (!textos.length) return sinTexto()

  const res = await ai.messages.create({
    model: MODEL,
    max_tokens: 500,
    temperature: 0,
    // El system es idéntico en todos los candidatos: cachearlo lo cobra a 0.1x
    // en las lecturas siguientes, igual que en anthropic.ts.
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: mensajeDe(input, textos) }],
  })

  const use = res.content.find((b) => b.type === 'tool_use')
  if (!use || use.type !== 'tool_use') throw new Error('sin tool_use en el veredicto de nicho')
  const parsed = VerdictSchema.parse(use.input)
  return { ...parsed, citaVerificada: citaRespaldada(parsed.cita, textos) }
}

// ─── El mismo veredicto por OpenAI ────────────────────────────────────────────
//
// Existe porque el pase de nombres corre sobre el texto YA guardado y ahí el
// modelo barato manda: gpt-5.6-luna cuesta $0,20/$1,20 por millón contra
// $1,00/$5,00 de Haiku. Comparte SYSTEM, schema y `citaRespaldada` con el camino
// de Anthropic a propósito — dos copias del prompt es como una se desincroniza.
//
// ⚠️ EL JSON SCHEMA VA ESCRITO A MANO, no con `z.toJSONSchema`. Los structured
// outputs de OpenAI exigen `additionalProperties: false` y TODAS las claves en
// `required`, mientras el schema de zod marca cinco como opcionales; convertirlo
// automáticamente es justo la transformación que AGENTS.md documenta como fuente
// de campos inventados. Con seis campos, escribirlo es más corto que adaptarlo.
//
// ⚠️ Y por eso los opcionales se piden igual y se rellenan con cadena vacía: en
// structured outputs `required` no significa "el dato existe", significa "la
// clave viene". Un string vacío es la forma de decir "no hay".
export const MODELO_OPENAI = process.env.PH_NICHO_MODEL_OPENAI ?? 'gpt-5.6-luna'

const JSON_SCHEMA = {
  name: 'veredicto',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'perteneceAlNicho', 'productName', 'descripcion', 'cita', 'motivo'],
    properties: {
      kind: { type: 'string', enum: ['fisico', 'digital', 'servicio', 'contenido', 'indeterminado'] },
      perteneceAlNicho: { type: 'boolean' },
      productName: { type: 'string' },
      descripcion: { type: 'string' },
      cita: { type: 'string' },
      motivo: { type: 'string' },
    },
  },
} as const

/**
 * Consumo acumulado del proceso. Existe para que el precio del barrido sea
 * MEDIDO y no estimado por caracteres: el costo lo domina la salida, y esa es
 * justo la parte que no se puede contar sin llamar.
 */
export const usoOpenAI = { llamadas: 0, input: 0, inputCacheado: 0, output: 0 }

export async function juzgarNichoOpenAI(input: VerdictInput): Promise<NichoVerdict> {
  const key = process.env.OPENAI_API_KEY
  if (!key || key.startsWith('sk-...')) throw new Error('falta OPENAI_API_KEY real')
  const textos = limpiarTextos(input.textos)
  if (!textos.length) return sinTexto()

  // En Node el fetch no tiene timeout propio: sin esto una petición colgada
  // detiene el barrido entero (la lección de `fetchKie`).
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO_OPENAI,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: mensajeDe(input, textos) },
      ],
      response_format: { type: 'json_schema', json_schema: JSON_SCHEMA },
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const j = (await res.json()) as {
    choices?: { message: { content: string | null } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number
              prompt_tokens_details?: { cached_tokens?: number } }
    error?: { message?: string }
  }
  if (j.usage) {
    usoOpenAI.llamadas++
    usoOpenAI.input += j.usage.prompt_tokens ?? 0
    usoOpenAI.inputCacheado += j.usage.prompt_tokens_details?.cached_tokens ?? 0
    usoOpenAI.output += j.usage.completion_tokens ?? 0
  }
  if (j.error) throw new Error(`openai: ${j.error.message ?? 'error'}`)
  const txt = j.choices?.[0]?.message?.content
  if (!txt) throw new Error('openai: respuesta sin contenido')
  const parsed = VerdictSchema.parse(JSON.parse(txt))
  return { ...parsed, citaVerificada: citaRespaldada(parsed.cita, textos) }
}
