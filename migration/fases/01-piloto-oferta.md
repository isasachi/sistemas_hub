# Fase 1 — Piloto híbrido: sección Oferta

**Objetivo:** que la sección Oferta se produzca como escena Gemini + composición Satori,
y que se vea al menos tan bien como la actual, con texto perfecto.

**Precondición:** Fase 0 aceptada.

**Checkpoint humano: SÍ, BLOQUEANTE.** El resultado es un juicio estético.
No avances a la Fase 2 sin aprobación explícita del usuario.

---

## Por qué Oferta primero

Es la sección con más texto exacto (precios, tiers, porcentajes), la que más falla hoy,
y la de mayor impacto directo en conversión. Si el híbrido no gana acá, no gana en ningún lado.

---

## El corte de `instructions.ts`

`buildSectionInstruction` hoy concatena 6 bloques. En híbrido se parten en dos destinos:

| Bloque actual | Destino |
|---|---|
| `SECTION_SPECS[type]` | **Se parte.** La mitad de escena (producto, pack, beneficiario) → prompt. La mitad de UI (cards de tier, ribbons, CTAs, strip de pagos) → layout. |
| `MASTER_LAYOUT` | **Layout.** Roles y jerarquía se vuelven estructura JSX real. |
| `DESIGN_SYSTEM` | **Se parte.** "Atmosphere", "Depth", "Product finish" → prompt. "Surfaces", "Graphic devices", "Type treatment" → layout. |
| `brandBlock()` | **Ambos.** Descripción textual → prompt de escena. Tokens → layout. |
| `productLine` + `labelBlock` | **Prompt.** Sin cambios respecto de hoy. |
| `copyBlock()` | **Layout.** Deja de ir al prompt. |
| `TEXT_RULES` | **Se elimina** para esta sección. Reemplazado por una negativa dura de texto. |

**No borres los bloques viejos.** Extraé a funciones nuevas y dejá las actuales
intactas para las 7 secciones no migradas.

---

## Commits

### C1.1 — Registry de motor

Crear `lib/landing/engine-registry.ts` con `HYBRID_SECTIONS` vacío.
En `sessions/[id]/section/[type]/route.ts`, bifurcar según ese set.
Con el set vacío, **el comportamiento no cambia en absoluto**. Verificalo antes de seguir.

### C1.2 — `buildSceneInstruction`

En `instructions.ts`, agregar (no reemplazar):

```ts
export function buildSceneInstruction(
  type: SectionType,
  productMode: 'source' | 'anchored' | 'none',
  palette?, typography?, brandStyle?, productLabels?
): string
```

Reusa: `SCENE_SPECS[type]` (nuevo, la mitad de escena de `SECTION_SPECS`),
`SCENE_CRAFT` (nuevo, la mitad de escena de `DESIGN_SYSTEM`), `brandBlock`,
`productLine`, `labelBlock`.

Y **termina con la negativa dura**, end-weighted igual que hoy hacés con `TEXT_RULES`:

```
NO TEXT (absolute): render ZERO text, letters, numbers, words, captions, labels,
badges-with-words, price tags, logos, watermarks or typography of any kind anywhere in
this image — with the SINGLE exception of the text physically printed on the product
itself. This is a background plate; all copy is composited afterwards. Leave the
composition breathing room where copy will be placed: keep the top third and the lower
third visually calm and uncluttered.
```

La última frase importa: la escena tiene que **dejar lugar** para la composición.
Sin eso vas a tener el producto justo donde van los tiers.

### C1.3 — Schema de oferta

En `types.ts`, agregar sin tocar `SectionCopySchema`:

```ts
export const OfferTierSchema = z.object({
  label:       z.string().max(20),          // "3 Frascos"
  price:       z.string().max(12),          // "S/ 199"
  priceBefore: z.string().max(12).optional(),// ancla → "S/ 507"
  savingsPct:  z.number().int().min(1).max(90).optional(),
  perUnit:     z.string().max(28).optional(),// "S/ 0.7 por cápsula"
  badge:       z.string().max(16).optional(),// "Mejor valor"
  cta:         z.string().max(18),
  featured:    z.boolean(),                  // el decoy destacado
})

export const OfferCopySchema = z.object({
  type: z.literal('oferta'),
  headline: z.string().max(60),
  subheadline: z.string().max(90).optional(),
  urgency: z.string().max(30).optional(),    // "Solo hoy"
  tiers: z.array(OfferTierSchema).min(2).max(4),
}).refine(d => d.tiers.filter(t => t.featured).length === 1,
  { message: 'exactamente un tier debe ser featured' })
```

El `.min(2)` y el `.refine()` **fuerzan estructuralmente el decoy del ADN**.
Deja de depender de que el LLM se acuerde. Si no cumple, `callStructured` reintenta
(ya tiene `maxRetries = 3`).

En `copy.ts`, cuando la sección es `oferta`, usar `OfferCopySchema`.
Actualizar `lib/prompts/landing-system.md` con las reglas de oferta: siempre precio
ancla si hay descuento, siempre costo por unidad en tiers multi-unidad, destacar el
mediano-alto.

### C1.4 — Layout de Oferta

Crear `lib/landing/layouts/oferta.tsx`. Recibe `(copy: OfferCopy, theme: ThemeTokens)`.

Anatomía, traducida directo del `SECTION_SPECS.oferta` actual:

- Banner de urgencia dorado arriba, **solo si** `copy.urgency`
- Headline (top third, una palabra en accent) + subheadline
- Fila de cards glass, una por tier:
  - label de cantidad
  - `priceBefore` tachado si existe
  - precio grande y pesado
  - `savingsPct` como cinta dorada si existe
  - `perUnit` en línea ligera si existe
  - CTA pill propio — **dorado si `featured`, accent si no**
- Tier `featured`: elevado, coronado con `GoldRibbon` con su `badge`
- Strip de pagos abajo (Fase 5 lo hace condicional; acá hardcodealo)

### C1.5 — Rama híbrida en la ruta

En `section/[type]/route.ts`, si el tipo está en `HYBRID_SECTIONS`:

1. `buildSceneInstruction(...)` → `generateImage(parts, 3, { aspectRatio: '9:16', imageSize: '2K' })`
2. `renderComposite(scene, <OfertaLayout copy={copy} theme={theme} />, { width: 1080, height: 1920 })`
3. Subir a Storage y persistir igual que hoy

**Regeneración con prompt en secciones híbridas:** `editWithPrompt` opera sobre la
imagen final compuesta y volvería a meter texto de IA. En esta fase, el regen con
prompt debe aplicarse **solo a la escena** y re-componer encima. Si el pedido del
usuario es sobre el copy, no toques la escena: regenerá la composición ($0).

### C1.6 — Activar y comparar

Agregar `'oferta'` a `HYBRID_SECTIONS`.

Generar la MISMA sesión por ambos caminos (motor viejo vs híbrido) sobre 3 productos
de nichos distintos: un suplemento, un gadget, un producto de hogar.
Guardar los 6 resultados para el checkpoint.

---

## Criterio de aceptación

1. Precios, porcentajes y CTAs **exactos**, sin una sola falta de ortografía.
2. Exactamente los tiers que el copy lista — ni uno más.
3. El tier destacado se lee como destacado a primera vista.
4. La escena no tiene texto (salvo la etiqueta del producto).
5. El producto no queda tapado por la composición en ninguno de los 3 nichos.
6. Cambiar un precio y re-renderizar **no dispara ninguna llamada de imagen**.

---

## Checkpoint humano — qué preguntar al usuario

Mostrale los 6 resultados lado a lado y preguntá exactamente esto:

1. ¿El glass simulado (Camino A de Fase 0) se ve premium, o hace falta el glass sandwich?
2. ¿La composición se siente integrada con la escena, o "pegada encima"?
3. ¿La escena deja suficiente aire para el copy en los 3 nichos?
4. ¿Seguimos con las 7 secciones restantes, o ajustamos el layout primero?

**Si la respuesta a 1 es "hace falta glass real", implementá el Camino B ANTES de
la Fase 2.** Cambia el sistema de layout completo y no querés reescribir 8 layouts después.
