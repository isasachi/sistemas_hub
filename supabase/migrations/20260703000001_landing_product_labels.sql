-- Texto exacto de las etiquetas impresas en el producto, tipeado por el usuario
-- (wordmark + sublabels + tamaño), una línea por renglón. Se inyecta como ground-truth
-- en el prompt de imagen para que el modelo renderice las palabras correctas en vez de
-- confabular texto ilegible desde la foto. Null = comportamiento actual (copiar de la foto).
alter table public.landing_sessions
  add column if not exists product_labels text;
