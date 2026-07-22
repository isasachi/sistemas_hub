# Fase 0 — Infraestructura de composición (Satori)

**Objetivo:** poder renderizar texto y UI pixel-perfecta sobre una imagen de fondo,
en 1080×1920, desde una ruta de Next en Vercel.

**Precondición:** ninguna. Es la fase base.

**Checkpoint humano:** no. Se valida con un PNG de prueba.

---

## Por qué Satori y no otra cosa

Playwright no corre en Vercel. `next/og` usa Satori (JSX → SVG) + resvg (SVG → PNG),
ambos WASM, y es la única ruta de composición de primera clase en el entorno actual.

Costo del cambio: Satori implementa un **subconjunto** de CSS.

| Necesidad del ADN | Estado en Satori | Solución |
|---|---|---|
| Gradientes, `border-radius`, `box-shadow` | Soportado | Directo |
| Fuentes custom | Soportado | Cargar `ArrayBuffer` |
| Flexbox | Soportado | Directo |
| CSS Grid | **No soportado** | Usar flex o posición absoluta |
| `backdrop-filter` (glass real) | **No soportado** | Ver abajo |
| Sellos/ribbons dorados | N/A | SVG inline |

---

## El problema del glassmorphism

El glass es la firma visual del ADN (`DESIGN_SYSTEM` línea "Surfaces (signature)").
Sin `backdrop-filter` hay dos caminos:

**Camino A — Glass simulado (empezá acá).**
Card con gradiente blanco semitransparente + borde superior de 1px claro + inner glow
+ drop shadow. Sobre un fondo etéreo y difuso como el que genera Gemini, lee como glass
en ~85% de los casos. Cero complejidad.

**Camino B — Glass sandwich (solo si A se ve plano).**
La escena se pre-desenfoca una vez con `sharp` (ya está en el stack, se usa en
`product-box.ts`). Cada card renderiza dentro suyo un `<img>` de la versión borrosa,
con `overflow: hidden` y offset negativo igual a su propia posición → el recorte
borroso coincide exactamente con lo que hay detrás. Glass real.

Costo del Camino B: **las cards deben estar posicionadas en absoluto**, porque
necesitás sus coordenadas para calcular el offset. Eso condiciona todo el sistema de
layout, así que la decisión se toma en la Fase 1 con la Oferta a la vista, no ahora.

Implementá el Camino A en esta fase y dejá el helper preparado para B.

---

## Commits

### C0.1 — Dependencias y config

- Verificar `next/og` disponible (Next 13.3+). No requiere paquete extra.
- `next.config.js`: agregar `outputFileTracingIncludes` para `./lib/landing/fonts/**`
  y `./lib/landing/devices/**`, o los archivos no llegan al bundle serverless de Vercel.
- Confirmar que `sharp` ya está como dependencia (lo usa `product-box.ts`).

### C0.2 — Catálogo tipográfico

Crear `lib/landing/typography-catalog.ts`.

6 pares curados, cada uno con un eje de nicho. Los `.ttf`/`.otf` (peso variable o
2-3 pesos por familia) van en `lib/landing/fonts/`.

```ts
export const TYPE_PAIRS = {
  'clinico-geometrico': { display: 'Poppins', body: 'Inter',        niche: 'salud, skincare, suplementos' },
  'wellness-humanista': { display: 'Nunito',  body: 'Source Sans 3', niche: 'bienestar, natural, bebé' },
  'premium-serif':      { display: 'Playfair Display', body: 'Lato', niche: 'belleza, joyería, lujo' },
  'urgencia-condensada':{ display: 'Archivo Black', body: 'Roboto',  niche: 'fitness, gadgets, oferta agresiva' },
  'tech-neutral':       { display: 'Space Grotesk', body: 'Inter',   niche: 'electrónica, tecnología' },
  'calido-redondeado':  { display: 'Baloo 2', body: 'Nunito Sans',   niche: 'hogar, cocina, mascotas' },
} as const

export const TypePairId = z.enum([...])  // ← el enum del invariante #3
```

Loader que devuelve los `ArrayBuffer` que espera `ImageResponse`, con caché a
nivel de módulo (mismo patrón que el `fs.readFileSync` de `lib/gemini.ts`).

> **Verificar licencias.** Todas deben ser SIL Open Font License o equivalente.
> Si alguna no lo es, reemplazala por una que sí y anotá el cambio.

### C0.3 — Librería de devices SVG

Crear `lib/landing/devices/`. Componentes SVG inline (no archivos externos, no `<img>`
remotos) parametrizados por color:

- `GoldRibbon` — plaque "Recomendado" / "Mejor valor"
- `GoldSeal` — medalla circular (garantía, "100%")
- `SavingsRibbon` — cinta "Ahorra X%"
- `CheckDisc` — disco de gradiente con símbolo + badge de check verde (el icono de beneficio del ADN actual)
- `Stars` — 5 estrellas doradas
- `TrustIcons` — shield, truck, clock, lock
- `PaymentLogos` — **Yape, Mercado Pago, Visa, Mastercard**, banderas PE/US

> Los logos de pago son assets de terceros. Usá los SVG oficiales de sus brand kits y
> respetá clear-space y proporciones. Este bloque es el que hoy es imposible por difusión
> y es el corazón del ADN de confianza — no lo aproximes.

### C0.4 — Tokens de tema

Crear `lib/landing/theme.ts`. Transforma `LandingStyle` (paleta + par tipográfico)
en un objeto de tokens plano que consumen los layouts:

```ts
type ThemeTokens = {
  accent: string; accentSoft: string;
  surface: string; surfaceBorder: string;
  textPrimary: string; textMuted: string;
  gold: string; goldDark: string;   // FIJO — no viene de la marca (invariante #4)
  fonts: { display: string; body: string }
}
```

El dorado se define acá, una sola vez, y no es configurable por marca.

### C0.5 — `renderComposite()`

Crear `lib/landing/composite.ts`:

```ts
export async function renderComposite(
  scene: Buffer | string,          // escena de Gemini (base64 o buffer)
  layout: ReactElement,            // JSX del layout de la sección
  opts: { width: number; height: number }
): Promise<Buffer>
```

- La escena entra como `<img>` de fondo en posición absoluta a tamaño completo.
- El `layout` se monta encima.
- Salida PNG → `sharp` → JPEG q92 (la salida final del tool debe ser JPEG por peso).
- Default 1080×1920 (9:16, el formato actual).

### C0.6 — Ruta de prueba

`app/api/generador-landing/_dev/composite-test/route.ts` (solo desarrollo).

Renderiza un layout de Oferta hardcodeado —3 tiers, ribbon dorado, strip de pagos—
sobre una imagen de fondo estática, y devuelve el JPEG.

---

## Criterio de aceptación

1. La ruta de prueba devuelve un JPEG 1080×1920 válido.
2. **Todo el texto es legible y está escrito correctamente**, con la fuente del catálogo.
3. Los logos de Yape y Mercado Pago se ven nítidos y reconocibles.
4. El ribbon dorado y los sellos se ven dimensionales, no planos.
5. Funciona en un deploy preview de Vercel, no solo en local.
   *(Este punto es el que más falla: fuentes que no llegan al bundle.)*

---

## Fuera de alcance en esta fase

- No tocar `instructions.ts`
- No tocar rutas de sección
- No tocar la DB
- No conectar nada al wizard
