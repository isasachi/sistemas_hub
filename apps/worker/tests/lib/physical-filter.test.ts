import { describe, it, expect } from 'vitest'
import { nonPhysicalSignal, isPhysicalEnough, servingSignal, isServible } from '@ph/shared'

// Medido contra los 3,970 anuncios que el LLM ya etiquetó: bloquea el 37% de lo
// no-físico perdiendo 1.8% de los físicos (y 30 de esas 43 pérdidas son
// marketplaces, que igual mueren en la regla 3). El sesgo es no perder producto.

describe('lista negra de no-físicos', () => {
  it('bloquea los clusters grandes', () => {
    expect(nonPhysicalSignal('(Doblado) Este chofer es imparable', 'Ns-yd-0419')?.cluster).toBe('drama')
    expect(nonPhysicalSignal('Láser CO2 para cicatrices', 'Grupo Beauty Liz')?.cluster).toBe('clinica')
    expect(nonPhysicalSignal('Curso de jabones artesanales', 'Academia en Línea')?.cluster).toBe('curso')
    expect(nonPhysicalSignal('Mega Venta', 'Temu Mexico')?.cluster).toBe('marketplace')
  })

  // Estos encabezaban TODAS las categorías del buscador: decenas de miles de
  // anuncios activos y ninguna caja que enviar. "Shoptemu" no empieza con "temu",
  // por eso hay que nombrarlo aparte.
  it('bloquea marketplaces y plataformas que copaban el ranking por anuncios', () => {
    expect(nonPhysicalSignal('Ofertas del día', 'Shoptemu')?.cluster).toBe('marketplace')
    expect(nonPhysicalSignal('Todo para tu hogar', 'Havan')?.cluster).toBe('marketplace')
    expect(nonPhysicalSignal('Viaja a donde quieras', 'Uber')?.cluster).toBe('plataforma')
    expect(nonPhysicalSignal('Escucha lo que quieras', 'Spotify')?.cluster).toBe('plataforma')
    expect(nonPhysicalSignal('Cashback', 'Mercado Pago')?.cluster).toBe('plataforma')
    // Y no se lleva puesto a un producto cuyo nombre solo EMPIEZA parecido.
    expect(isPhysicalEnough('Faja moldeadora', 'Disneyland Fajas')).toBe(true)
  })

  // Estos no encabezaban nada — poblaban la COLA, y salieron a la luz al pasar
  // de mostrar 10 productos por rango a mostrar 50 paginados.
  it('bloquea bancos, telcos y universidades, que nunca envían una caja', () => {
    expect(nonPhysicalSignal('Abre tu cuenta', 'Banco Plata')?.cluster).toBe('servicio')
    expect(nonPhysicalSignal('Protege tu auto', 'Seguros SURA Colombia')?.cluster).toBe('servicio')
    expect(nonPhysicalSignal('Estudia con nosotros', 'UPN Posgrado')?.cluster).toBe('servicio')
    expect(nonPhysicalSignal('Plan ilimitado', 'Claro Colombia')?.cluster).toBe('servicio')
    expect(nonPhysicalSignal('Ofertas', 'plazaVea')?.cluster).toBe('marketplace')
    // ⚠️ Por esto las telcos van ancladas al inicio: con \b, "claro" se llevaba
    // puesto a un suplemento real.
    expect(isPhysicalEnough('Respira mejor', 'Suplemento Aire Claro')).toBe(true)
  })

  // Adobe llegaba primero en su nicho con 7,008 anuncios. Dos de sus cuatro
  // filas traen `{{product.name}}` como único texto: si el filtro mirara el
  // cuerpo del anuncio no tendría NADA que leer, por eso esto va por el nombre.
  it('bloquea software, SaaS y edtech aunque el anuncio venga sin texto', () => {
    expect(nonPhysicalSignal('{{product.name}} — {{product.brand}}', 'Adobe Creative Cloud')?.cluster).toBe('software')
    expect(nonPhysicalSignal('Probar Acrobat Pro', 'Adobe Latinoamerica')?.cluster).toBe('software')
    expect(nonPhysicalSignal('Diseña lo que quieras', 'Canva')?.cluster).toBe('software')
    expect(nonPhysicalSignal('Aprende a tu ritmo', 'Udemy')?.cluster).toBe('software')
    expect(nonPhysicalSignal('Pregúntame lo que sea', 'ChatGPT')?.cluster).toBe('software')
  })

  it('bloquea apps y juegos que se nombran a sí mismos', () => {
    expect(nonPhysicalSignal('Baja de peso', 'Simple App')?.cluster).toBe('app-nombre')
    expect(nonPhysicalSignal('Resúmenes de libros', 'Headway App')?.cluster).toBe('app-nombre')
    expect(nonPhysicalSignal('Juega gratis', 'MindCare Game Mahjong Other')?.cluster).toBe('app-nombre')
    // ⚠️ `studio` se descartó a propósito: son negocios reales, no apps.
    expect(isPhysicalEnough('Vestidos a medida', 'Auka Dress Studio')).toBe(true)
    expect(isPhysicalEnough('Marcos de colección', 'Grid Studio Perú')).toBe(true)
  })

  it('deja pasar productos físicos que MENCIONAN a un médico o un tratamiento', () => {
    // El error caro: una crema real citando a una dermatóloga.
    expect(isPhysicalEnough('Una dermatóloga lo explica ✅', 'Auré Profesional')).toBe(true)
    expect(isPhysicalEnough('Deja de gastar en tratamientos que no duran', 'Valentina EC')).toBe(true)
    expect(isPhysicalEnough('Rodillera térmica con imanes', 'OrtoVital')).toBe(true)
  })

  it('la señal de envío manda sobre la lista negra', () => {
    const t = 'Curso rápido de belleza — envío gratis a todo el país'
    expect(isPhysicalEnough(t, 'Tienda X')).toBe(true)
  })

  it('lee el texto en unicode matemático que usa Meta', () => {
    expect(nonPhysicalSignal('𝐋𝐢𝐦𝐩𝐢𝐞𝐳𝐚 𝐟𝐚𝐜𝐢𝐚𝐥 para adolescentes', 'H Centro')?.cluster).toBe('clinica')
  })

  it('sin texto no descarta', () => {
    expect(isPhysicalEnough(null, null)).toBe(true)
    expect(isPhysicalEnough('{{product.name}}', 'Alquimia Botanica')).toBe(true)
  })
})

// Dos motivos que NO son "no es físico": Nike manda una caja igual que la red de
// spam. Por eso viven en servingSignal y no en nonPhysicalSignal.
describe('lo que no merece un lugar en la vitrina', () => {
  it('saca las marcas grandes, que no son una oportunidad', () => {
    expect(servingSignal('Just Do It', 'Nike')?.cluster).toBe('marca-grande')
    expect(servingSignal('Bleu de Chanel', 'CHANEL')?.cluster).toBe('marca-grande')
    expect(servingSignal('Serum reparador', 'La Roche-Posay')?.cluster).toBe('marca-grande')
    // Pero siguen siendo productos físicos: el otro filtro no las toca.
    expect(isPhysicalEnough('Just Do It', 'Nike')).toBe(true)
  })

  it('las marcas de colisión conocida van ancladas al inicio', () => {
    expect(servingSignal('Cosméticos', 'Natura')?.cluster).toBe('marca-grande')
    // ⚠️ Otras empresas que solo CONTIENEN la palabra: si esto se bloquea, el
    // ancla se perdió.
    expect(isServible('Suplementos naturales', 'Santa Natura')).toBe(true)
    expect(isServible('Cuidado de la piel', 'ZEN natura MX')).toBe(true)
  })

  it('caza la red de spam por la forma del nombre', () => {
    expect(servingSignal('Brochas', 'Emboadlie.xs01')?.cluster).toBe('spam')
    expect(servingSignal('Cepillo', 'Beyonddraw.ND02')?.cluster).toBe('spam')
    expect(servingSignal('Faja', 'NS-YXB-YHb')?.cluster).toBe('spam')
    // El nombre pelado y el que lleva TLD: no hay forma que detectar, por eso
    // las bases van en lista.
    expect(servingSignal('Brochas', 'Emboadlie')?.cluster).toBe('spam')
    expect(servingSignal('Ofertas', 'Accurateg.shop')?.cluster).toBe('spam')
  })

  it('⚠️ no se lleva puesta a una tienda real con código de país', () => {
    // Cada uno de estos cayó con una versión más floja del patrón.
    for (const tienda of [
      'Detodo.cl', 'Aqualo.ar', 'coofandy.shop', 'KiddoSpace-MX', 'Kokoro-ec',
      'Luramart-us', 'HerramientasJ&M', 'MayoristaC&Y', 'ChaskiBox.593',
      'PulseSense-N1', 'Shopymarket.2',
    ]) {
      expect(isServible('Envío a todo el país', tienda), tienda).toBe(true)
    }
  })
})
