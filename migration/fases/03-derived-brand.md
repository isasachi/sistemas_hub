# Fase 3 — `DerivedBrand`: marca derivada del producto

**Objetivo:** que la paleta, la tipografía y la demografía del talento se deriven
del producto, se resuelvan una sola vez por sesión, y sean editables por el usuario
antes de generar nada.

**Precondición:** Fase 2 completa.

**Checkpoint humano: SÍ, BLOQUEANTE.** El punto de revisión ES la feature.

---

## El problema

Hoy `LandingStyleSchema` es `{ palette, typography }` con `typography` como **texto libre**
(`{ headline: string, body: string }`). Eso tiene tres fallas:

1. **La tipografía no se puede componer.** Un nombre de fuente en texto libre funciona
   como sugerencia a un modelo de difusión, pero Satori necesita un archivo. Rompe el
   invariante #3.
2. **La paleta se extrae solo de la foto.** El frasco de CLEARSTEM es blanco; la paleta
   azul-agua **no sale del frasco**, sale del código cromático del nicho salud/pureza.
   `style-extract.ts` no puede llegar ahí mirando píxeles.
3. **La demografía del talento no existe como dato.** `audience` es texto libre que va
   al prompt. Por eso cada sección puede salir con una persona distinta.

## El cambio

Un objeto `DerivedBrand` resuelto una vez, persistido, editable, con **dos consumidores**:
CSS tokens para la composición y descripción textual para el prompt de escena.

---

## Commits

### C3.1 — Schema

En `types.ts`:

```ts
export const NicheCode = z.enum([
  'salud-clinico',      // azul-blanco, pureza      → suplementos, skincare
  'fitness-energia',    // negro-naranja-lima       → deporte, quemadores
  'belleza-premium',    // nude-dorado-crema        → cosmética, joyería
  'hogar-calido',       // terracota-beige          → cocina, decoración
  'tech-limpio',        // gris-azul brillante      → gadgets, electrónica
  'bebe-pastel',        // pastel suave             → bebé, maternidad
])

export const CastingSpecSchema = z.object({
  present:    z.boolean(),                                    // false → producto solo
  ageRange:   z.enum(['18-25','25-35','35-50','50-65','65+']).optional(),
  gender:     z.enum(['femenino','masculino','mixto']).optional(),
  appearance: z.string().max(120).optional(),  // rasgos latinoamericanos, piel real, etc.
  context:    z.string().max(60).optional(),   // baño, cocina, gimnasio, exterior
  wardrobe:   z.string().max(60).optional(),
  expression: z.string().max(60).optional(),   // serena y segura / enérgica
})

export const DerivedBrandSchema = z.object({
  niche:      NicheCode,
  palette:    LandingStyleSchema.shape.palette,   // reusa el shape actual
  typePair:   TypePairId,                         // ← ENUM del catálogo (Fase 0)
  casting:    CastingSpecSchema,
  sceneMood:  z.string().max(160),                // alimenta el prompt de escena
})
```

`sceneMood` es el reemplazo estructurado de lo que hoy hace `brand_style` como
texto suelto. `brand_style` sigue existiendo para el handoff desde branding.

### C3.2 — Derivación

Crear `lib/landing/derive-brand.ts`:

```ts
export async function deriveBrand(session): Promise<DerivedBrand>
```

Entradas: `product_name`, `benefits`, `audience`, `tone`, `product_photo_urls`,
y `palette`/`typography` si vinieron del handoff de branding.

Proceso:

1. **Nicho** — una llamada `callStructured` con la foto + el brief → `NicheCode`.
   Barata, `gemini-2.5-flash`.
2. **Paleta** — combinar dos fuentes: colores del packaging (`style-extract.ts`, ya existe)
   + familia cromática del nicho. El color del packaging manda como accent de marca;
   el nicho manda la atmósfera. Si vino paleta del branding, **esa gana y no se deriva**.
3. **Par tipográfico** — el LLM elige un `TypePairId` del enum. Nunca texto libre.
   Pasale las descripciones de nicho del catálogo como contexto.
4. **Casting** — derivar de `audience` + `benefits`. Si el producto no lleva persona
   (gadget de auto, herramienta), `present: false`.
5. **sceneMood** — una frase que describa atmósfera y ambiente para el prompt.

Todo en **una sola llamada** `callStructured` con `DerivedBrandSchema` como
`responseSchema`, salvo la paleta que se fusiona en código después.

### C3.3 — Migración

```sql
-- Marca derivada del producto: nicho, paleta, par tipográfico del catálogo, casting
-- del talento y mood de escena. Se resuelve una vez por sesión (etapa 2→3), es editable
-- por el usuario y alimenta tanto la composición (tokens) como el prompt de escena (texto).
alter table public.landing_sessions
  add column if not exists derived_brand jsonb;
```

`palette` y `typography` **quedan como están** — son el legado y el canal del handoff
de branding. `derived_brand` los supera cuando existe. Sin backfill, sin borrar nada.

### C3.4 — Paso de revisión en el wizard

Nueva sub-etapa entre fotos (2) y copy (3). Muestra:

- Los 6 swatches de la paleta, editables (color picker + hex)
- El par tipográfico elegido, con preview real del headline y un dropdown con los otros 5
- El nicho detectado, cambiable
- El casting: edad, género, apariencia, contexto — todo editable
- Un toggle "sin persona"

Botón: **Confirmar identidad visual**.

> Esta pantalla es el mayor ahorro de la migración. Hoy, si la demografía sale mal,
> lo descubrís después de quemar 8 generaciones de imagen. Acá lo ves antes de quemar cero.

### C3.5 — Conectar a los dos consumidores

- `lib/landing/theme.ts` (Fase 0): `DerivedBrand` → `ThemeTokens` para la composición
- `brandBlock()` en `instructions.ts`: agregar una variante que consuma `DerivedBrand`
  y produzca el bloque de texto con `sceneMood` + descripción de paleta.
  **Mantener la firma vieja** para las secciones no migradas.

---

## Criterio de aceptación

1. Tres productos de nichos distintos → tres paletas, tres pares tipográficos y tres
   castings claramente distintos.
2. Un producto sin persona (ej. accesorio de auto) → `casting.present === false`.
3. Editar la paleta en el wizard cambia la composición sin regenerar la escena.
4. El `typePair` siempre es uno de los 6 del catálogo. Sin excepciones.
5. Una sesión con handoff de branding conserva la paleta del branding intacta.

---

## Checkpoint humano

Mostrá los `DerivedBrand` de 3 productos distintos y preguntá:

1. ¿El casting es el correcto para cada público?
2. ¿La paleta se siente del producto, o genérica del nicho?
3. ¿Falta algún eje tipográfico en el catálogo de 6?
