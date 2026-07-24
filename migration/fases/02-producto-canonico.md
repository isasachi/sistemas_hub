# Fase 2 — Producto canónico desde la foto real

**Objetivo:** eliminar la degradación generacional del ancla y romper la
dependencia serial entre secciones.

**Precondición:** Fase 1 aprobada.

**Checkpoint humano:** no. Se valida comparando etiquetas entre secciones.

---

## El problema

Cadena actual:

```
foto real → render sección 1 → bbox (Gemini vision) → crop (sharp) → input de secciones 2-8
```

Dos consecuencias:

1. **Degradación generacional.** El ancla no es el producto: es la *interpretación*
   que hizo Gemini del producto. Las secciones 2-8 copian una copia. Las etiquetas
   chicas se degradan en cada salto.
2. **Serialidad forzada.** La sección 1 debe terminar antes de que arranque cualquier
   otra. Bloquea la Fase 6.

El comentario de `20260702000001_landing_product_canonical.sql` ya describe la intención
correcta —"extracción quirúrgica del producto"— pero la implementación lo extrae del
render, no de la fuente.

## El cambio

```
foto real → bbox (Gemini vision) → crop (sharp) → placa canónica → input de TODAS las secciones
```

`product-box.ts` **ya hace exactamente esto**. Lo único que cambia es de dónde toma
la imagen de entrada y cuándo se ejecuta.

Efectos:
- El ancla es el producto real, no una alucinación de él
- Desaparece la distinción `source` / `anchored`: todas las secciones usan un único modo
- Las 8 secciones quedan independientes
- Se puede derivar apenas el usuario sube la foto (etapa 2), antes de generar nada

---

## Commits

> **`product-box.ts` YA IMPLEMENTA la extracción.** `extractProductBox` (bbox por
> `gemini-2.5-flash` en formato nativo `box_2d` 0-1000) y `cropProduct` (extract con
> `sharp`, padding 6%, import dinámico con fallback) quedan **tal cual**. No los reescribas.
> Esta fase es **recablear de dónde viene el buffer de entrada**, no implementar nada nuevo.
>
> Nota: `cropProduct` devuelve un **recorte rectangular** (PNG opaco, con fondo alrededor),
> no un contorno con alfa. Es suficiente: el ancla se usa como *placa de referencia* para
> Gemini, no como capa componible. La alfa real solo hace falta para C2.5.

### C2.1 — Derivar el ancla en la etapa de fotos

En `sessions/[id]/photos/route.ts`, después de subir a Storage:

1. Elegir la foto con el producto más grande y frontal (o la primera, si es ambiguo)
2. `extractProductBox` + `cropProduct` sobre esa foto real
3. Subir a Storage, persistir en `product_canonical_url`

**Ajuste requerido en el `SYSTEM` de `product-box.ts`:** hoy describe la entrada como
*"ONE marketing image ... surrounded by text, people and scenery"*, porque asumía el render
de la sección 1. Apuntado a una foto cruda esa descripción no calza y degrada la detección
en packshots limpios sobre fondo blanco. Generalizar a: la entrada puede ser un packshot
limpio, una foto de producto en contexto o una pieza de marketing. El resto del prompt
—formato `box_2d`, excluir sombra/texto/personas, agrupar packs— queda igual.

Si falla → `product_canonical_url` queda null. Fallback: usar las fotos crudas.
**Nunca peor que hoy**, igual que el fallback actual.

Esto convierte la extracción de un efecto colateral de la sección 1 en un paso
explícito de su propia etapa.

### C2.2 — Unificar el modo de producto

En `instructions.ts`, `productMode` pasa de `'source' | 'anchored' | 'none'` a
`'canonical' | 'none'`.

`'canonical'` fusiona lo mejor de los dos textos actuales:

- De `anchored`: "Image 1 es un recorte AISLADO del producto, sin layout ni escena propia;
  no copies encuadre, fondo ni composición de ella"
- De `source`: fidelidad física total, color exacto, sin recolorear ni blanquear,
  reproducción exacta de todas las etiquetas impresas
- Imágenes 2+ siguen siendo las fotos reales como ground-truth de etiquetas
- `labelBlock` con `product_labels` sigue intacto — es autoritativo

Mantené `'source'` y `'anchored'` en el tipo por compatibilidad con sesiones
en curso, marcados `@deprecated`.

### C2.3 — Limpiar la ruta de sección

Quitar de `section/[type]/route.ts`:
- La lógica de "¿es la primera sección generada?"
- La derivación del ancla post-render
- La escritura de `product_canonical_url` desde ahí

La ruta queda sin estado compartido entre secciones. **Ese es el punto.**

### C2.4 — Migración

`supabase/migrations/2026XXXX_landing_canonical_source.sql`:

```sql
-- Origen de la placa canónica: 'photo' (nuevo, derivada de la foto real en etapa 2)
-- o 'render' (legado, recortada del render de la primera sección).
alter table public.landing_sessions
  add column if not exists product_canonical_source text;
```

Sesiones viejas quedan null → se tratan como `'render'`. Sin backfill.

---

## Criterio de aceptación

1. Generar las 8 secciones y comparar la etiqueta del producto entre todas:
   el wordmark y los sublabels deben ser consistentes.
2. Generar las secciones en orden **inverso** (cta-final primero): el resultado
   debe ser equivalente. Si lo es, la serialidad murió.
3. Una sesión donde `extractProductBox` falla sigue generando las 8 secciones.

---

## Opcional — C2.5: alfa real por chroma-key

Consistencia pixel-perfect: en vez de pedirle a Gemini que redibuje el producto en cada
escena, **componerlo** con `sharp` sobre la escena. Requiere un PNG con canal alfa real,
que `cropProduct` no produce (devuelve un rectángulo opaco).

Camino sin dependencias nuevas y dentro de la regla Gemini:

1. Partir del recorte rectangular que ya genera `cropProduct`
2. `editWithPrompt` sobre él: *"place this exact product, unchanged, centered on a
   completely uniform pure magenta background (#FF00FF), no shadow, no reflection on the
   backdrop"*
3. Chroma-key con `sharp`: máscara por distancia de color al magenta → `joinChannel` como
   canal alfa → PNG transparente

Magenta y no verde ni blanco: el verde tiñe los reflejos de productos claros, y el blanco
es indistinguible de un producto blanco (el caso más común en suplementos).

**Dónde falla:** productos transparentes, de vidrio o muy brillantes — el borde queda duro
y los reflejos se comen el keying. Para plásticos opacos funciona bien.

**No lo hagas en esta fase.** Evaluá después de la Fase 4, cuando veas cuánta deriva de
producto queda realmente con el ancla ya apuntando a la foto real. Si la deriva es
tolerable, esto es complejidad que no comprás.
