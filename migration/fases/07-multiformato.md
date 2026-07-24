# Fase 7 — Multiformato desde una sola escena

**Objetivo:** producir 4:5 y 1:1 sin regenerar la escena.

**Precondición:** todas las secciones migradas a híbrido.

**Checkpoint humano:** no.

---

## Por qué ahora es posible

Con el motor viejo, cada formato era una generación de imagen nueva —y con ella,
otra tirada de dados sobre el texto, el producto y la persona.

En híbrido, la escena es una placa de fondo. Un formato nuevo es **un recrop de la
escena + un layout distinto**. Cero llamadas al modelo.

Esto abre uso más allá de la landing: las mismas secciones como creativos de feed
para Meta Ads, que es exactamente el input del que salió el ADN.

---

## Commits

### C7.1 — Registro de formatos

```ts
export const FORMATS = {
  'landing-9-16': { w: 1080, h: 1920, use: 'sección de landing' },
  'feed-4-5':     { w: 1080, h: 1350, use: 'anuncio de feed' },
  'square-1-1':   { w: 1080, h: 1080, use: 'catálogo, carrusel' },
} as const
```

### C7.2 — Escena a mayor resolución

Generar la escena con margen para recortar. La escena 9:16 a 2K ya tiene alto de
sobra para 4:5 y 1:1 recortando por altura, pero el sujeto queda descentrado.

Pedir en el prompt de escena que el sujeto y el producto queden dentro del **tercio
central vertical**, para que todo recorte los conserve. Es una línea en `buildSceneInstruction`.

### C7.3 — Layouts responsivos

Cada layout recibe el formato y ajusta:
- 9:16 → los tiers en columna o fila según quepan
- 4:5 → menos aire, headline más chico, tiers siempre en fila
- 1:1 → solo lo esencial: headline, producto, un CTA

No es CSS responsive: son ramas explícitas por formato. Con Satori es más simple y
más predecible.

### C7.4 — Exportar el set

Botón **Descargar campaña** → ZIP con las 8 secciones en los formatos elegidos.
Nombres de archivo predecibles: `{orden}-{tipo}-{formato}.jpg`.

---

## Criterio de aceptación

1. Los 3 formatos de una sección salen de una única llamada de imagen.
2. En los 3, el producto está completo y no cortado.
3. El texto es legible en el lado más chico (1080×1080).
