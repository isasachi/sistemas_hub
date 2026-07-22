# Fase 5 — ADN de oferta y confianza como contrato

**Objetivo:** que la psicología de oferta y el bloque de confianza sean estructura
tipada y coherente entre secciones, no copy que el LLM recuerda o inventa.

**Precondición:** Fase 4 completa. Las 8 secciones migradas a híbrido.

**Checkpoint humano:** no. Se valida con tests.

---

## Los tres problemas

**1. El ADN de oferta vive en un solo lugar.**
La Fase 1 lo forzó en `OfferCopySchema` para la sección Oferta. Pero el hero, el
cta-final y la garantía también mencionan precio y urgencia, y ahí sigue siendo texto libre.

**2. El ADN de confianza se inventa por sección.**
`SECTION_SPECS.garantia` describe filas de confianza —envío, plazo, contraentrega,
compra segura— pero el contenido lo genera el LLM dentro de esa sección.
Consecuencia: puede inventar un plazo de entrega que el usuario no cumple, y puede
contradecir lo que dice otra sección.

**3. No hay coherencia cruzada.**
Es el error real de las referencias CLEARSTEM: en una pieza el frasco cuesta S/99 sin
ancla, en otra aparece con "antes S/169". Quien ve ambas detecta el precio inflado.
Hoy nada lo impide.

---

## Commits

### C5.1 — La oferta sube a nivel de sesión

Mover `tiers` de `OfferCopySchema` a un objeto de sesión:

```ts
export const OfferSchema = z.object({
  tiers: z.array(OfferTierSchema).min(2).max(4),
  urgency: z.string().max(30).optional(),
}).refine(d => d.tiers.filter(t => t.featured).length === 1)
```

La sección Oferta lo **consume**, no lo posee. El hero y el cta-final pueden
referenciar el tier destacado sin poder contradecirlo.

### C5.2 — `TrustBlock`

```ts
export const TrustBlockSchema = z.object({
  codDelivery:   z.boolean(),                    // pago contraentrega
  deliveryTime:  z.string().max(24).optional(),  // "24/48 horas"
  coverage:      z.array(z.string().max(20)).max(4).optional(), // ["Perú","EE.UU."]
  paymentMethods: z.array(z.enum([
    'yape','plin','mercadopago','visa','mastercard','efectivo','transferencia',
  ])).max(7),
  guaranteeDays: z.number().int().min(0).max(365).optional(),
  guaranteeText: z.string().max(60).optional(),
  freeShipping:  z.boolean().default(false),
})
```

**Esto lo llena el usuario en el wizard, no el LLM.** Son hechos operativos de su
negocio; un modelo no puede inferirlos y no debería inventarlos.

`paymentMethods` es un enum porque cada valor mapea a un SVG real de la librería de
devices (Fase 0, C0.3). Es lo que hace que el ADN de confianza sea posible.

### C5.3 — Migración

```sql
-- Oferta y bloque de confianza a nivel de sesión: los tiers de precio (con decoy) y los
-- hechos operativos del negocio (contraentrega, plazos, medios de pago, garantía) dejan de
-- ser copy por sección y pasan a ser datos compartidos, para que ninguna sección contradiga
-- a otra. `trust_block` lo llena el usuario en el wizard, no el LLM.
alter table public.landing_sessions
  add column if not exists offer jsonb,
  add column if not exists trust_block jsonb;
```

### C5.4 — Validador cruzado de set

Crear `lib/landing/validate-set.ts`. Función pura sobre la sesión completa:

```ts
export function validateSet(session): SetIssue[]
```

Reglas:
- Todo precio mencionado en cualquier sección existe en `offer.tiers`
- El plazo de entrega es el mismo en toda sección que lo mencione
- Ninguna sección promete un medio de pago fuera de `trust_block.paymentMethods`
- Ninguna sección menciona garantía si `guaranteeDays` es 0 o null
- Si un tier tiene `priceBefore`, ninguna otra sección muestra ese precio sin el ancla

Es una función pura, barata de testear, e **imposible de conseguir por prompt**.
Se corre después de generar el copy y se muestran los issues en el gate de aprobación.

### C5.5 — Layouts restantes

Actualizar los layouts de `garantia` y `cta-final` para consumir `TrustBlock`
directamente: pills glass con icono + título + línea, logos de pago reales,
sello dorado de garantía. Nada de esto lo genera ya el LLM.

---

## Criterio de aceptación

1. Una sesión con precios contradictorios entre secciones dispara issues de `validateSet`.
2. La sección Garantía renderiza exactamente los medios de pago del `TrustBlock`.
3. Con `codDelivery: false`, ninguna sección menciona contraentrega.
4. El LLM no puede producir un set con dos tiers destacados ni con uno solo.
