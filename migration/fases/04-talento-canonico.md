# Fase 4 — Talento canónico

**Objetivo:** una sola persona en toda la campaña.

**Precondición:** Fase 3 aprobada (`CastingSpec` existe y es editable).

**Checkpoint humano: SÍ, BLOQUEANTE.** La cara del talento es la decisión estética
más visible de toda la landing.

---

## El problema

Hoy el beneficiario se genera dentro de cada sección desde `MASTER_LAYOUT`
("a person fitting the audience"). Ocho secciones = ocho personas distintas.

Eso delata más al creativo que cualquier otra falla — más incluso que un texto mal
escrito, porque el usuario ve las 8 piezas en secuencia al scrollear la landing.

Es el mismo problema que la Fase 2 resolvió para el producto. Misma solución.

---

## Commits

### C4.1 — Generar el talento

Crear `lib/landing/talent.ts`:

```ts
export async function generateTalent(casting: CastingSpec, brand: DerivedBrand): Promise<string>
```

- `casting.present === false` → devuelve null, no genera nada
- Prompt: retrato de medio cuerpo, fondo neutro liso, luz suave y direccional,
  **sin texto**, expresión y wardrobe del casting, mirada a cámara
- Pedir explícitamente rasgos reales y no idealizados (pecas, textura de piel):
  es lo que hace creíbles las referencias del ADN
- `generateImage` con `aspectRatio: '3:4'`

Fondo neutro a propósito: es una **placa de referencia**, no una escena. Se integra
después en cada sección igual que el producto canónico.

### C4.2 — Migración

```sql
-- Placa canónica del talento: retrato del beneficiario derivado UNA vez por sesión
-- desde el CastingSpec, sobre fondo neutro. Se pasa como referencia a todas las secciones
-- para que la persona no cambie entre ellas. Null si el producto no lleva persona.
alter table public.landing_sessions
  add column if not exists talent_canonical_url text;
```

### C4.3 — Pasar el talento a las escenas

En `buildSceneInstruction`, cuando hay talento canónico, agregar un bloque
paralelo al `productLine`, con el mismo rigor:

```
Image N is the CAMPAIGN TALENT — the exact person who appears across this entire
landing. Reproduce this same person IDENTICALLY: same face, age, skin tone, hair and
build. Re-pose, re-light and re-frame them to fit this section's composition, but never
substitute, restyle, beautify or age them. Image N is ONLY a person reference: do not
copy its neutral background or framing.
```

Orden de imágenes en el `parts[]`: producto canónico → fotos reales → talento.
Documentá el orden en el código: `productLine` y el bloque de talento **se refieren a
las imágenes por número**, así que el orden es parte del contrato.

### C4.4 — Revisión y regeneración

En el paso de revisión de la Fase 3, mostrar el talento generado con un botón
**Generar otra persona**. Cuota aparte, más generosa que la de secciones: es una sola
imagen y es la decisión que más importa acertar.

---

## Criterio de aceptación

1. Las 8 secciones muestran a la misma persona, reconocible.
2. La persona coincide con la demografía del `CastingSpec`.
3. Un producto con `present: false` genera las 8 secciones sin ninguna persona.
4. Regenerar el talento y volver a generar una sección refleja la persona nueva.

---

## Checkpoint humano

1. ¿Es la misma persona en las 8, sin dudas?
2. ¿La persona se siente real o se ve "de stock IA"?
3. ¿La integración en cada escena es creíble, o parece pegada?
