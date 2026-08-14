// Regla 1 sin LLM: descarta lo que claramente NO es un producto físico vendible.
//
// Es una LISTA NEGRA, no un clasificador. No intenta decidir qué es cada cosa:
// solo bloquea cuando hay una señal inequívoca de que no se envía un objeto.
// Todo lo demás pasa — el sesgo es el mismo de siempre, ante la duda se conserva.
//
// Las señales salen de mirar los 4,492 anuncios que el LLM ya etiquetó: los
// no-físicos se concentran en dos clusters enormes y muy reconocibles —
// apps de dramas/novelas cortas, y clínicas/spas de estética.

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Meta deja mucho texto en unicode "matemático" (𝐂𝐚𝐧𝐬𝐚𝐝𝐚): se aplana a ASCII.
    .replace(/[\u{1D400}-\u{1D7FF}]/gu, (c) => {
      const cp = c.codePointAt(0)!
      const off = (cp - 0x1d400) % 52
      return off < 26 ? String.fromCharCode(65 + off) : String.fromCharCode(97 + off - 26)
    })
    .toLowerCase()

// ── Cluster 1: apps de dramas / novelas / streaming ──────────────────────────
// Las tres últimas alternativas son portugués: las mismas granjas de novelas
// pautan en pt-BR y la regla en español no las tocaba. Salieron de paginar hasta
// el final de una categoría, donde se concentran.
const DRAMA = /\b(doblado|drama|dramas|novela|novelas|serie|series|episodio|episodios|capitulo|capitulos|short drama|shortmax|dramabox|pocket fm|webtoon|manhwa|toca para ver|sigue viendo|seguir viendo|ver el final|get the full story|tap to watch|watch (more|the full|wonderful)|descarga la aplicacion|descargar y mirar|mira gratis ahora|baixe para assistir|assista de graca|leia a versao completa)\b/

// ── Cluster 2: clínicas, spas y consultorios ─────────────────────────────────
// Ojo: acá los términos sueltos ("dermatólogo", "spa", "sucursal") NO sirven —
// un anuncio de crema los usa igual ("una dermatóloga lo explica"). Solo cuenta
// el NOMBRE del anunciante, o una frase que pida agendar.
const CLINICA_NOMBRE = /\b(clinic\w*|consultorio|spa|dermatolog\w*|cirugia|odontolog\w*|centro medico|centro estetic\w*|estetic\w*|esthetic\w*|medispa|policlinic\w*|laser|plastic surgery|skin (studio|laundry|care)|beauty (studio|salon|bar|center|liz)|depilacion|podolog\w*|lunares)\b/
// Procedimientos que se hacen EN un local: nadie te los envía a casa.
const CLINICA_TEXTO = /\b(agenda tu (cita|hora|consulta)|agende su (cita|hora)|reserva tu (cita|hora|turno)|pide tu cita|solicita tu cita|separa tu cita|primera consulta|nuestras? sedes?|atencion presencial|limpieza facial|laser co2|depilacion laser|extraccion de lunares|microneedling|radiofrecuencia|cirugia plastica|plastic surgery|medicina estetica|rejuvenecimiento facial|hidrafacial|puntas de diamante|diagnostico gratis)\b/

// ── Cluster 3: cursos, ebooks, membresías ────────────────────────────────────
const CURSO = /\b(curso|cursos|ebook|e-book|masterclass|webinar|taller online|clases online|mentoria|coaching|membresia|suscripcion mensual|guia en pdf|pdf gratis|programa de \d+ (dias|semanas)|reto de \d+ dias)\b/

// ── Cluster 4: software y apps ───────────────────────────────────────────────
const APP = /\b(descarga (la |nuestra )?app|descargar (la )?app|instala (la )?app|app store|google play|play store|aplicacion gratis|version premium|prueba gratis \d+ dias)\b/

// Marketplaces: no venden producto propio, así que su página nunca es del
// producto que trajo la búsqueda.
// Sin \b al final: los nombres reales vienen pegados al país ("TemuPeru",
// "SHEIN KIDS"). `amazon` va aparte con frontera para no comerse "Amazonia".
// `shoptemu` va explícito: no empieza con "temu" y es, medido 2026-08-12, el
// anunciante con más anuncios de toda la base (50k, en 40 nichos distintos).
const MARKETPLACE = /^(alibaba|aliexpress|shein|temu|shop ?temu|mercado ?libre|linio|falabella|ripley|lazada|shopee|tiktok ?shop|google ads)|^(amazon|wish|walmart|ebay|havan|carrefour|sodimac|promart|coppel|liverpool|elektra|casas ?bahia|magazine ?luiza|americanas|submarino|home ?depot|the home depot|plaza ?vea|tottus|jumbo|lider|sam'?s club|suburbia|el palacio de hierro|petco|sephora|zara home|groupon|iherb|marcimex|totto|cencosud|almacenes)\b/

// Plataformas y apps globales: mismo problema que los marketplaces (decenas de
// miles de anuncios activos, ninguna caja que enviar), pero no son tiendas.
// Salieron de mirar qué encabezaba cada categoría del buscador: al agrupar
// nichos, estas páginas ganaban todos los chips.
const PLATAFORMA = /^(uber|airbnb|spotify|netflix|disney|paramount|hbo|prime video|tiktok|instagram|facebook|whatsapp|mercado ?pago|rappi|didi|pedidos ?ya|binance|booking|despegar|melolo|hallow|roblox|indrive|revolut|meta for business)\b/

// ── Cluster 6: servicios que nunca envían una caja ───────────────────────────
// Bancos, aseguradoras, telcos y universidades. Salieron de paginar las 50 de
// cada categoría: no encabezaban el ranking (por eso no aparecieron cuando solo
// se mostraban 10), pero pueblan la cola con "Banco Plata", "Seguros SURA",
// "Claro Colombia", "UPN Posgrado".
// Las marcas de telco van ANCLADAS al inicio del nombre a propósito: `claro` con
// \b se llevaría puesto al "Suplemento Aire Claro", que sí es un producto.
// `institutos?` va junto a `universidad` porque salieron juntos al medir: 60+
// nombres del tipo "Instituto Nord", "ITQ - Instituto Superior Tecnológico".
// Cubre además los institutos médicos, que son clínicas con otro nombre.
const SERVICIO_NOMBRE = /\b(bancos?|seguros|aseguradora|financiera|cooperativa|universidad|universitaria|institutos?|posgrados?|maestrias?|business school|educacion continua|casinos?|apuestas|betsson|bet365|1xbet|codere|forex|remitly|ria money|c6 bank|bradesco|klar|metlife|kaiser permanente|ggpoker|turo|tickpick)\b|^(claro|movistar|telcel|entel|tigo|directv|izzi|totalplay|infinitum|copec|compensar)\b/

// ── Cluster 7: software, SaaS y edtech con marca propia ──────────────────────
// El disparador fue "Adobe Creative Cloud": 7,008 anuncios activos, el primero
// de su nicho, y ninguna lista de arriba lo veía — no es marketplace, no es
// plataforma de consumo, no es banco. Dos de sus cuatro filas llegan con
// `{{product.name}}` sin renderizar como único texto, así que el NOMBRE del
// anunciante es la única señal que existe para ellas.
const SOFTWARE_NOMBRE = /\b(adobe|acrobat|creative cloud|microsoft|office 365|canva|figma|notion|dropbox|salesforce|hubspot|shopify|godaddy|mcafee|chatgpt|openai|midjourney|copilot|paypal|udemy|coursera|platzi|domestika|duolingo|babbel|crehana|classpass|kavak|monday\.com|twilio|deel|elevenlabs|photoroom|meshy|speechify|coursiv|mindvalley|betterme|yoga.?go|justfit|fitbod|calm|airalo|holafly)\b/

// Apps y juegos que se nombran a sí mismos. Medido sobre las 70,175 filas de la
// base: los 77 anunciantes con "app"/"apps" en el nombre son apps, sin un solo
// falso positivo — por eso acá la palabra suelta sí alcanza, al revés que en el
// cluster de clínicas. `studio` se probó y se DESCARTÓ: 172 nombres, casi todos
// negocios reales (Auka Dress Studio, Bombshell Nails & Lashes Studio).
const APP_NOMBRE = /\b(apps?|games?|chatbot|streaming|player)\b/

// Señales de que SÍ se envía un objeto: mandan sobre las de arriba, porque el
// error caro es descartar un producto real.
const FISICO = /\b(envio gratis|envios gratis|pago contra ?entrega|contra ?entrega|contraentrega|pagas al recibir|paga al recibir|recibelo en tu (casa|domicilio)|delivery gratis|stock disponible|ultimas unidades|tallas disponibles|colores disponibles|garantia de \d+ (dias|meses|anos))\b/

export interface NonPhysicalHit { cluster: string; match: string }

/**
 * Devuelve el motivo por el que el anuncio NO es un producto físico, o null si
 * no hay señal clara (→ pasa el filtro).
 */
export function nonPhysicalSignal(
  text: string | null | undefined,
  advertiser?: string | null,
): NonPhysicalHit | null {
  const nombre = norm(advertiser ?? '')
  const mkt = nombre.match(MARKETPLACE)
  if (mkt) return { cluster: 'marketplace', match: mkt[0] }
  const plat = nombre.match(PLATAFORMA)
  if (plat) return { cluster: 'plataforma', match: plat[0] }
  const serv = nombre.match(SERVICIO_NOMBRE)
  if (serv) return { cluster: 'servicio', match: serv[0] }
  // Antes del override de FISICO, igual que los tres de arriba: las marcas
  // grandes sí usan esas palabras — "Uber Eats" anuncia "delivery gratis", y a
  // un anuncio de Adobe no lo vuelve físico que diga "prueba sin costo".
  const soft = nombre.match(SOFTWARE_NOMBRE)
  if (soft) return { cluster: 'software', match: soft[0] }
  const appN = nombre.match(APP_NOMBRE)
  if (appN) return { cluster: 'app-nombre', match: appN[0] }

  const t = norm(`${advertiser ?? ''} ${text ?? ''}`)
  if (FISICO.test(t)) return null

  // En el NOMBRE del anunciante "drama" va sin frontera: las granjas de novelas
  // se llaman MiniDramas, DramaBox, Drama Vibes…
  const dramaNombre = nombre.match(/drama|short ?max|pocket ?fm|theater|teatro/)
  if (dramaNombre) return { cluster: 'drama', match: dramaNombre[0] }

  const enNombre = nombre.match(CLINICA_NOMBRE)
  if (enNombre) return { cluster: 'clinica', match: enNombre[0] }

  for (const [cluster, re] of [
    ['drama', DRAMA], ['clinica', CLINICA_TEXTO], ['curso', CURSO], ['app', APP],
  ] as const) {
    const m = t.match(re)
    if (m) return { cluster, match: m[0] }
  }
  return null
}

export const isPhysicalEnough = (text?: string | null, advertiser?: string | null) =>
  nonPhysicalSignal(text, advertiser) === null

// ─────────────────────────────────────────────────────────────────────────────
// Lo que sigue NO responde "¿es un producto físico?" — responde "¿esto merece
// un lugar en la vitrina?". Son dos motivos distintos del de arriba y por eso
// viven en otra función: Nike sí manda una caja, y la red de spam también.
// ─────────────────────────────────────────────────────────────────────────────

// Marcas grandes: envían un objeto, pero no son una OPORTUNIDAD. Tienen su
// propio canal y su propia demanda; el buscador existe para encontrar productos
// sin dueño, y estas ocupan los primeros puestos de la vitrina por volumen de
// anuncios, que es justo el orden en que se sirve.
// Las de colisión conocida van ANCLADAS al inicio: `natura` con \b se llevaba
// puesto a "Santa Natura" y "ZEN natura MX", que son otras empresas; `metro` y
// `wong` son palabra corriente y apellido.
const MARCA_GRANDE = /\b(nike|adidas|reebok|under armour|levi'?s|lacoste|new balance|new era|skechers|crocs|converse|chanel|gucci|dior|prada|versace|calvin klein|carolina herrera|tommy hilfiger|ray.?ban|oakley|l'?oreal|la roche.?posay|nivea|garnier|maybelline|revlon|pantene|dove|colgate|oral.?b|avon|mary kay|oriflame|omnilife|yanbal|esika|cyzone|samsung|sony|philips|huawei|panasonic|epson|mcdonald'?s|burger king|kfc|starbucks|sonic drive|kroger|bodega aurrera|colsubsidio|la anonima)\b|^(natura|metro|wong|exito)\b/

// Red de spam. Es la fuente de basura más grande que queda: al medir la vitrina,
// 15 de los 25 primeros por anuncios eran de esta red, con hasta 8,904 anuncios
// activos y casi todos en el mismo nicho. No se reconoce por una palabra sino
// por la FORMA del nombre — una palabra inventada en inglés más un código de
// granja ("Emboadlie.xs01", "Beyonddraw.ND02") — y por la serie "Ns-".
//
// Las bases van en lista explícita porque la red también publica el nombre
// pelado ("Emboadlie", "Accurateg") o con TLD ("Accurateg.shop"), y ahí no hay
// forma que detectar. Son palabras inventadas: no colisionan con nada.
const SPAM_BASE = /^(emboadlie|benighty|beyonddraw|atmospherei|hardpointing|documentw|applicabley|occasionalous|visulong|statisticsing|civilizek|pickelect|sakesfor|classificaty|explanationi|ancienflow|regulatev|repertoireof|deepwily|accurateg|roarrave|comstipose|newmindstart|approvalp|flowarmth|gloryboom|frequentlyk|forttender)\b/

// ⚠️ El código exige 1-3 letras Y 2-3 dígitos, y esa precisión no es cosmética.
// Con la forma floja (sufijo de letras sueltas) se iban puestas "KiddoSpace-MX",
// "Kokoro-ec", "Luramart-us" y "HerramientasJ&M": tiendas reales con su código
// de país. Y sin exigir dos dígitos caían "PulseSense-N1" y "ChaskiBox.593"
// (593 es el código de Ecuador). Todo eso está medido, no supuesto.
const SPAM_FORMA = /^[a-z]{6,}[.\-&/·][a-z]{1,3}\d{2,3}$|^(ns|srsz)[-\d]/

/**
 * Todo lo que no debe llegar a la vitrina: lo no-físico, las marcas grandes y
 * la red de spam. Es lo que usa el serving.
 */
export function servingSignal(
  text: string | null | undefined,
  advertiser?: string | null,
): NonPhysicalHit | null {
  const nombre = norm(advertiser ?? '')
  const spam = nombre.match(SPAM_BASE) ?? nombre.match(SPAM_FORMA)
  if (spam) return { cluster: 'spam', match: spam[0] }
  const marca = nombre.match(MARCA_GRANDE)
  if (marca) return { cluster: 'marca-grande', match: marca[0] }
  return nonPhysicalSignal(text, advertiser)
}

export const isServible = (text?: string | null, advertiser?: string | null) =>
  servingSignal(text, advertiser) === null
