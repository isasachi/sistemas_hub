// EL LOGOTIPO (BRANDBOOK.md §1).
//
// El mark no es "texto en dos colores": el color cambia en una línea vertical
// que ignora dónde terminan las palabras — LEG|ACY, BR|AND. El corte cae
// DENTRO de la palabra. Por eso el split va por índice de carácter y no por
// porcentaje: un porcentaje se corre con la fuente y con el tamaño, y el
// corte dejaría de caer donde el logotipo lo pone.
//
// Se compone como markup en vez de usar el PNG porque el archivo original es
// 100% opaco (granate pleno, sin alfa): a 68px de navbar sería un cuadrado
// granate con dos líneas ilegibles. El PNG vive en /brand/logo.png y se usa
// donde un ráster sí sirve — favicon y og:image.
//
// Las dos líneas del logo están justificadas al mismo ancho; BRAND tiene una
// letra menos, así que lleva tracking propio para igualar a LEGACY.

type Line = { head: string; tail: string; tracking: string };

// ponytail: el lockup es un dato, no una prop — si algún día hay una segunda
// marca, esto pasa a prop. Hoy es una sola y no hace falta.
const LOCKUP: Line[] = [
  { head: "LEG", tail: "ACY", tracking: "-0.01em" },
  { head: "BR", tail: "AND", tracking: "0.055em" },
];

export function Wordmark({
  size = 20,
  className = "",
}: {
  /* px por línea. El carmesí pleno #BD1347 da 3.05:1 sobre el granate:
     cumple como texto grande en negrita, así que no bajes de 18. */
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`jr-wordmark inline-flex flex-col ${className}`}
      style={{ fontSize: `${size}px` }}
      aria-label="Legacy Brand"
      role="img"
    >
      {LOCKUP.map(({ head, tail, tracking }) => (
        <span key={head} aria-hidden style={{ letterSpacing: tracking }}>
          <span style={{ color: "var(--brand)" }}>{head}</span>
          <span style={{ color: "var(--text)" }}>{tail}</span>
        </span>
      ))}
    </span>
  );
}
