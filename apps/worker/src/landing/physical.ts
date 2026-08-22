// physical_product (spec §24).
//
// ⚠️ ES UNA VARIABLE DISTINTA DE `ecommerce`, y el spec insiste en eso por una
// razón concreta: una clínica dental no es ninguna de las dos, pero una tienda
// que vende un irrigador es las dos, y un SaaS con checkout es ecommerce SIN ser
// físico. Colapsarlas en un booleano deja pasar justo el tercer caso.
//
// La pregunta acá es: ¿hay una CAJA que se envía?
import { nonPhysicalSignal } from '@ph/shared'
import type { LandingSignals } from './parse'

// Destinos que NO son una landing: chats y perfiles sociales. El anuncio manda a
// conversar, no a una ficha, así que no hay nada que analizar — y llamarlos "no
// físico" sería mentirle al embudo del §38: no se sabe qué venden, no se sabe
// que no vendan nada. Es la misma distinción que ya hace `product-key.ts` del
// motor viejo, donde un link de chat tampoco identifica un producto.
const SOCIAL = /^(m\.me|wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp\.com|instagram\.com|facebook\.com|messenger\.com|t\.me|telegram\.me|linktr\.ee|linktree\.com|beacons\.ai|bit\.ly|tiktok\.com|youtube\.com|youtu\.be)$/i

/** ¿El destino del anuncio es un chat o un perfil social en vez de una tienda? */
export function isSocialDestination(domain: string | null | undefined): boolean {
  if (!domain) return false
  return SOCIAL.test(domain.replace(/^www\./i, ''))
}

export interface PhysicalVerdict {
  physical: boolean
  reason: string | null
}

// Cosas que se compran online y no se envían. `isSoftware` ya cubre apps; esto
// cubre lo demás que tiene checkout pero no tiene caja.
// ⚠️ "programa online" y sus parientes entraron por un caso MEDIDO: en el nicho
// "faja lumbar" pasó como producto físico *"Fuerza y Movilidad Programa Online"*
// de "Proyecto Columna", que es un infoproducto de libro. `curso online` ya
// estaba; lo que faltaba era que el mismo negocio se vende también como
// "programa", "plan", "rutina", "entrenamiento" o "asesoría" en línea.
const INTANGIBLE = /\b((programa|plan|rutina|entrenamiento|asesor[íi]a|consultor[íi]a|mentor[íi]a|taller|clase|masterclass|webinar)\s+(online|virtual|en l[íi]nea|digital)|curso online|clases? en vivo|acceso inmediato al (curso|contenido)|descarga inmediata|archivo digital|pdf descargable|ebook|e-book|licencia digital|c[óo]digo de activaci[óo]n|gift ?card|tarjeta de regalo|reserva tu (lugar|cupo)|entradas?|boletos?|membres[íi]a|suscripci[óo]n mensual)\b/i

// Envío físico explícito: si la página promete que llega a una dirección, hay
// caja. Es la señal positiva más limpia que existe para esto.
const SHIPS = /\b(env[íi]o gratis|env[íi]os? a todo el pa[íi]s|entrega a domicilio|recibe en tu (casa|domicilio)|contra ?entrega|pago contra entrega|despacho a domicilio|free shipping|ships? (to|within)|tiempo de entrega|d[íi]as h[áa]biles)\b/i

/**
 * `pageName` y `adText` son OPCIONALES y vienen del anuncio, no de la landing:
 * reusan la lista negra ya medida de `@ph/shared` (clínicas, cursos, apps,
 * marketplaces) sobre 4.492 anuncios etiquetados. Sirven para el caso en que la
 * landing no se pudo leer.
 */
export function classifyPhysical(
  s: LandingSignals | null,
  pageName?: string,
  adText?: string,
): PhysicalVerdict {
  // La lista negra del motor viejo primero: es la que más evidencia tiene detrás.
  const blocked = nonPhysicalSignal(adText, pageName)
  if (blocked) return { physical: false, reason: `lista negra (${blocked.cluster}): ${blocked.match}` }

  if (!s) return { physical: false, reason: 'sin landing legible' }

  if (s.isServicePage) return { physical: false, reason: 'página de servicios' }
  if (s.hasAppointment) return { physical: false, reason: 'pide agendar cita' }
  if (s.isSoftware) return { physical: false, reason: 'software o app' }

  const hay = `${s.title ?? ''} ${s.h1 ?? ''} ${s.jsonLd?.name ?? ''}`
  if (INTANGIBLE.test(hay)) return { physical: false, reason: 'producto intangible' }

  // Un schema Product con precio es la declaración de la propia tienda de que
  // vende un producto. Con envío declarado, doble confirmación.
  if (s.hasProductSchema && s.hasPrice) return { physical: true, reason: 'schema Product con precio' }
  if (s.hasShipping && s.hasAddToCart) return { physical: true, reason: 'carrito con envío' }
  if (s.platform && s.hasAddToCart && s.hasPrice) {
    return { physical: true, reason: `tienda ${s.platform} con carrito y precio` }
  }
  if (s.platform && s.isProductUrl && s.hasPrice) {
    return { physical: true, reason: `ficha de producto en ${s.platform} con precio` }
  }
  if (SHIPS.test(hay)) return { physical: true, reason: 'promete envío' }
  // Ficha de producto con precio en un dominio propio. Sin plataforma conocida
  // no hay evidencia estructural de tienda, pero `/p/<slug>` + precio ya
  // describe un artículo con su valor. Medido: las fichas de isdin.com
  // (colutorio, pasta dentífrica) caían acá siendo productos de una marca real.
  if (s.isProductUrl && s.hasPrice) return { physical: true, reason: 'ficha de producto con precio' }

  // Ante la duda NO se afirma que es físico: el costo de un falso positivo acá
  // es publicar una clínica como producto, y el de un falso negativo es perder
  // un candidato que la próxima corrida vuelve a traer.
  return { physical: false, reason: 'sin señal de producto enviable' }
}

export { INTANGIBLE, SHIPS }
