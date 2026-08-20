# BRANDBOOK — Legacy Brand

Sistema de diseño del hub, derivado del logotipo (`apps/web/public/brand/logo.png`).
Todo lo que sigue sale del archivo del logo, no de gusto: los tres colores son
los tres colores que el PNG realmente tiene, y el mecanismo de la marca es el
que el logotipo ya ejecuta.

La implementación vive en `apps/web/app/globals.css`. Este documento explica
**por qué** cada token es lo que es; el CSS es la fuente de verdad de **cuánto**.

---

## 1. De dónde sale todo: lectura del logotipo

El PNG (1101×1100, sin transparencia) tiene exactamente tres colores con peso:

| color | hex | % de píxeles | rol en el logo |
|---|---|---|---|
| Granate profundo | `#1E0811` | 90.93 % | el campo entero |
| Carmesí | `#BD1347` | 4.29 % | mitad izquierda del texto |
| Crema cálida | `#F6F2EB` | 4.09 % | mitad derecha del texto |

No hay un cuarto color, no hay degradado y no hay metal. Cualquier oro, naranja
o plata en el sitio es herencia del sistema anterior, no de esta marca.

### El mecanismo de la marca: el corte a mitad de palabra

El logo no es "texto en dos colores". El color cambia en una **línea vertical
que ignora dónde terminan las palabras**: `LEG|ACY`, `BR|AND`. El corte cae
dentro de la palabra, no entre palabras. Eso convierte al lockup en un solo
campo sólido atravesado por un filo, y es lo único verdaderamente distintivo
del logotipo.

Ese filo es **la firma del sistema** y se llama `.lp-cut`. Es el único gesto
audaz que el sitio se permite; todo lo demás es disciplina y silencio.

Las dos líneas están además **justificadas al mismo ancho** (LEGACY y BRAND
miden lo mismo), con las letras casi tocándose. La tipografía de display de
este sistema se compone así: bloque cerrado, tracking negativo, sin aire.

---

## 2. Color

### Paleta

| token | hex | rol | origen |
|---|---|---|---|
| `--bg` / `--surface` | `#14050A` / `#1E0811` | lienzo y base de card | del logo |
| `--brand` | `#BD1347` | **acción** — rellenos (CTA, activo) | del logo |
| `--brand-bright` | `#E8467A` | **acción** — texto e iconos | derivado |
| `--text` | `#F6F2EB` | tinta y **prestigio** | del logo |
| `--text-muted` | `#C9B4AE` | texto secundario | derivado (crema desaturada) |

### Los dos ejes

El sistema anterior tenía dos acentos (naranja = acción, dorado = prestigio).
Este logotipo trae **un solo acento**, así que el segundo eje lo carga la crema:

- **Carmesí = acción.** CTA, link, estado activo, anillo de foco. Un solo objeto
  carmesí pleno por pantalla. Si hay dos, ninguno manda.
- **Crema = prestigio y luz.** Eyebrows, badges, la fuga de luz de las cards,
  hairlines. Es el contraste que el propio logo usa, y no inventa un color
  que la marca no tiene.

Nunca al revés: un eyebrow carmesí compite con el CTA y rompe la jerarquía.

### Por qué hay dos carmesíes

`#BD1347` sobre `#1E0811` da **3.05:1** de contraste — suficiente para un
relleno o un borde, insuficiente para leer. Por eso:

- `--brand` `#BD1347` → solo **fondos** (botón carmesí con texto crema: 5.62:1).
- `--brand-bright` `#E8467A` → todo lo que sea **texto o icono** carmesí (5.09:1).

Usar `--brand` como color de texto es el error a vigilar en este sistema.

### Contraste medido (sobre `#1E0811`)

| color | ratio | uso permitido |
|---|---|---|
| `#F6F2EB` crema | 17.14 | todo |
| `#C9B4AE` ash | 9.67 | texto secundario |
| `#A98C88` subtle | 6.19 | metadata, labels |
| `#967B76` faint | 4.91 | el piso — nada más tenue que esto |
| `#E8467A` carmesí claro | 5.09 | texto de acción |
| `#BD1347` carmesí | 3.05 | **solo relleno y borde** |

### Estados: no son colores de marca

`--danger` pasó de `#e93d3d` a **`#FF5A3C`**. El rojo anterior es vecino del
carmesí de marca en la rueda: un error y un botón primario se leían de la misma
familia. El bermellón es claramente más cálido y separa las dos lecturas.
Verde y azul de estado no cambian de rol, solo de calibración.

---

## 3. Tipografía

Tres voces, cada una con un solo trabajo. Syne, que antes existía únicamente
para el logotipo, se retira: ese papel lo cumple ahora Bodoni Moda.

### Titulares — **Poppins**

Todos los titulares del sistema, tanto el default de `h1–h6` como el display
de `.lp-serif`. Es la voz que tenían **antes del rebranding** y a la que se
volvió por decisión del dueño del repo: un titular en didona se lee editorial,
y esto es una herramienta de trabajo, no una revista.

```
h1–h6        → 600 / −0.01em
.lp-serif    → 600 / −0.02em (8 usos, todos display)
```

⚠️ El peso y el tracking vuelven **con** la familia. El 800 / −0.03em que tuvo
la didona estaba dimensionado para sus finos de pelo; en una geométrica como
Poppins sale pesado y apretado.

### UI y cuerpo — **Archivo**

Grotesca de apertura cerrada. Aguanta el `0.22em` de tracking en mayúsculas de
11px de los eyebrows sin deshacerse. Cubre interfaz, cuerpo y cifras
(`.readout`, con `tabular-nums`): una sola familia para las tres funciones.

### Logotipo — **Bodoni Moda**

La didona del archivo de marca: astas gruesas, finos de pelo, remates planos
sin bracket. **Solo `.jr-wordmark`, y en ningún otro lado.** Si aparece en un
titular deja de ser exclusiva del logotipo, y entonces deja de marcarlo.

**Nunca por debajo de 20px**: a tamaño chico los finos de pelo desaparecen y
la letra se ve rota. Por eso no toca ni labels ni cifras.

### Jerarquía

| rol | familia | peso | tracking |
|---|---|---|---|
| Display (`.lp-serif`) | Poppins | 600 | −0.02em |
| Titular (h1–h6) | Poppins | 600 | −0.01em |
| Logotipo | Bodoni Moda | 900 | −0.01em |
| Cuerpo | Archivo | 400 | 0 |
| Eyebrow / label | Archivo | 600, 11px, mayúsculas | 0.22em / 0.14em |
| Cifras | Archivo | tabular-nums | −0.01em |

⚠️ **Poppins es de render crítico y se pide en el `<link>` del chrome**, no en
el del catálogo, aunque el contenido generado para el cliente también la use
(`lib/landing/niches.ts`). Colgarla del link rotulado "no es del chrome" es
invitar a que alguien lo borre y se lleve puestos todos los titulares. Lato sí
vive solo en el catálogo: la UI no la usa.

---

## 4. Estructura y superficie

- **Profundidad por hairline, no por color.** Las cards no se separan del fondo
  con otro tono: se separan con una línea de 1px y una fuga de luz.
- **La fuga de luz (`.lp-leak`) ahora es crema**, no dorada. Es el eje de
  prestigio haciendo su trabajo: una barra de 1px que se apaga al cruzar el
  borde superior más un halo difuso desde la esquina.
- **Radio:** `--radius: 1rem`. Superficies amables, que es lo que pide una
  herramienta de trabajo — y lo que hizo que los titulares volvieran a una
  geométrica en vez de quedarse en la didona.
- **Sin degradados de marca.** El logo no tiene ninguno. El CTA es carmesí
  plano. `--brand-gradient` sobrevive solo como alias para no romper archivos.

---

## 5. La firma: `.lp-cut`

El corte del logotipo, aplicado a un titular de display: la línea se parte con
un filo vertical, crema de un lado y carmesí del otro, cortando **a mitad de
palabra**.

```html
<h1 class="lp-serif">
  <span class="lp-cut" data-cut="El poder de la IA">El poder de la IA</span>
</h1>
```

Reglas de uso:
- **Una sola vez por pantalla.** Es la firma, no una decoración.
- El corte cae donde el logo lo pone: dentro de una palabra, no en un espacio.
- Solo sobre display de 30px o más.
- El texto real vive en el DOM una sola vez; la mitad carmesí es un
  `::after` con `aria-hidden`, así el lector de pantalla lee la frase una vez.

---

## 6. Accesibilidad (piso no negociable)

- Todo texto cumple **4.5:1**; el display grande cumple 3:1 como mínimo.
- `:focus-visible` siempre visible — anillo carmesí de 3px.
- `prefers-reduced-motion` apaga marquee, shimmer, float, rise y el sheen.
- El color nunca es el único portador de significado: los estados llevan icono
  o texto además del tono.

---

## 7. Qué NO tocar

1. **El segundo `@import` de fuentes** — es el catálogo del contenido generado
   para clientes, no el chrome.
2. **Las superficies de preview del generador de landings y de branding.** Los
   hex de marca que aparecen en `SectionIdentity`, `Section4Preview`,
   `SectionTrust` y `BriefShell` son chrome del wizard (spinners, chips,
   toggles) y sí se repintan; el lienzo del preview del cliente lo define la
   paleta extraída de SU marca y no se toca nunca.
3. **`--font-mono` y `.readout`** — van en Archivo. Las cifras necesitan ancho
   fijo (`tabular-nums`), que ni Poppins ni la didona del logotipo aportan.
4. **Los alias heredados** (`--lp-*`, `.gradient-text`, `.lp-serif`) — los
   nombran decenas de archivos. Cambiaron de valor, no de nombre.
