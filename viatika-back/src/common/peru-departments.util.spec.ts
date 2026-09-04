import {
  DEPARTAMENTO_DESCONOCIDO,
  departamentoLabel,
  DESTINO_EXTERIOR,
  esDestinoExterior,
  PERU_DEPARTAMENTOS,
  resolveDepartamento,
} from './peru-departments.util'

describe('resolveDepartamento', () => {
  it('reconoce el nombre del departamento tal cual', () => {
    expect(resolveDepartamento('Loreto')).toBe('Loreto')
    expect(resolveDepartamento('San Martín')).toBe('San Martín')
  })

  it('tolera la falta de tildes y las mayúsculas', () => {
    expect(resolveDepartamento('ANCASH')).toBe('Áncash')
    expect(resolveDepartamento('junin')).toBe('Junín')
    expect(resolveDepartamento('apurimac')).toBe('Apurímac')
  })

  it('resuelve la ciudad a su departamento', () => {
    expect(resolveDepartamento('Iquitos')).toBe('Loreto')
    expect(resolveDepartamento('Trujillo')).toBe('La Libertad')
    expect(resolveDepartamento('Chiclayo')).toBe('Lambayeque')
    expect(resolveDepartamento('Pucallpa')).toBe('Ucayali')
    expect(resolveDepartamento('Juliaca')).toBe('Puno')
  })

  it('usa el segmento más a la derecha de una dirección completa', () => {
    // La dirección va de lo específico a lo general: el departamento está al final.
    expect(resolveDepartamento('Av. Larco 123, Miraflores, Lima')).toBe('Lima')
    expect(resolveDepartamento('Jr. Prospero 456, Iquitos, Loreto')).toBe(
      'Loreto'
    )
  })

  it('no confunde un distrito de Lima con otro departamento', () => {
    expect(resolveDepartamento('San Juan de Miraflores')).toBe('Lima')
    expect(resolveDepartamento('Ventanilla')).toBe('Callao')
  })

  it('encuentra el departamento dentro de texto libre', () => {
    expect(resolveDepartamento('Hotel Bolognesi Tacna')).toBe('Tacna')
    expect(resolveDepartamento('viaje a Cusco por proyecto')).toBe('Cusco')
  })

  it('ignora las palabras de relleno del destino', () => {
    expect(resolveDepartamento('Destino: ciudad de Piura')).toBe('Piura')
    expect(resolveDepartamento('Departamento de Ancash')).toBe('Áncash')
  })

  it('no caza un alias corto dentro de otra palabra', () => {
    // "ate" (distrito de Lima) no debe dispararse dentro de "Matecito".
    expect(resolveDepartamento('Matecito')).toBeNull()
  })

  it('devuelve null cuando el texto no permite deducirlo', () => {
    expect(resolveDepartamento('Etapas suplencia VD-124')).toBeNull()
    expect(resolveDepartamento('')).toBeNull()
    expect(resolveDepartamento(undefined)).toBeNull()
    expect(resolveDepartamento('Perú')).toBeNull()
  })

  it('cada departamento de la lista se resuelve a sí mismo', () => {
    for (const dep of PERU_DEPARTAMENTOS) {
      expect(resolveDepartamento(dep)).toBe(dep)
    }
  })

  // Los campamentos no son distritos, así que no salen del padrón de ubigeo, y
  // son a donde de verdad viaja la gente de Detroit. Estos cuatro destinos son
  // los que en producción se agrupaban en "Sin departamento".
  it('reconoce los campamentos mineros', () => {
    expect(resolveDepartamento('Minas de Toquepala 23800, Perú')).toBe('Tacna')
    expect(resolveDepartamento('Toquepala 08360, Perú')).toBe('Tacna')
    expect(resolveDepartamento('San Juan de Marcona, Perú')).toBe('Ica')
    expect(resolveDepartamento('Antamina')).toBe('Áncash')
    expect(resolveDepartamento('Cuajone')).toBe('Moquegua')
  })

  // Google Places pega el código postal al nombre ("San Juan de Marcona 11420").
  it('ignora el código postal que pega Google Places', () => {
    expect(resolveDepartamento('Marcona 11420, Perú')).toBe('Ica')
    expect(resolveDepartamento('Chimbote 02803, Perú')).toBe('Áncash')
  })

  // Se agota cada segmento antes de pasar al siguiente: si se miraran primero
  // todos los exactos, el "San Juan" suelto de la izquierda ganaría.
  it('prefiere el segmento de la derecha aunque el de la izquierda sea exacto', () => {
    expect(resolveDepartamento('San Juan, San Juan de Marcona 11420, Perú')).toBe(
      'Ica'
    )
  })

  it('resuelve provincias y distritos que no estaban en la lista a mano', () => {
    expect(resolveDepartamento('Ilabaya')).toBe('Tacna')
    expect(resolveDepartamento('Challhuahuacho')).toBe('Apurímac')
    expect(resolveDepartamento('Torata, Moquegua')).toBe('Moquegua')
  })

  // Hay 97 nombres repetidos entre departamentos: mandarlos a uno cualquiera
  // escondería el gasto en otra región, así que quedan sin resolver salvo que
  // un alias a mano decida el empate.
  it('no adivina con los nombres que se repiten entre departamentos', () => {
    // "Santa Rosa" es distrito en siete departamentos.
    expect(resolveDepartamento('Santa Rosa')).toBeNull()
    // "La Libertad" es distrito de Huaraz, pero el departamento manda.
    expect(resolveDepartamento('La Libertad')).toBe('La Libertad')
    // "Independencia" y "San Miguel" sí los decide la lista a mano: en Detroit
    // son los distritos de Lima.
    expect(resolveDepartamento('Independencia')).toBe('Lima')
    expect(resolveDepartamento('San Miguel')).toBe('Lima')
  })
})

describe('destinos del exterior', () => {
  it('marca como exterior lo que está fuera del Perú', () => {
    expect(departamentoLabel('CANTON MICHIGAN - EEUU')).toBe(DESTINO_EXTERIOR)
    expect(departamentoLabel('Santiago, Chile')).toBe(DESTINO_EXTERIOR)
    expect(departamentoLabel('Miami')).toBe(DESTINO_EXTERIOR)
    expect(esDestinoExterior('Bogotá, Colombia')).toBe(true)
  })

  it('no confunde un destino nacional con el exterior', () => {
    expect(esDestinoExterior('Trujillo, Perú')).toBe(false)
    expect(esDestinoExterior('Minas de Toquepala 23800, Perú')).toBe(false)
    expect(esDestinoExterior('')).toBe(false)
    expect(esDestinoExterior(undefined)).toBe(false)
  })

  // Varias ciudades del extranjero comparten nombre con un distrito nuestro
  // ("Córdoba" está en Huancavelica), y el formato normal es "Ciudad, País".
  it('el país manda cuando cierra el texto', () => {
    expect(departamentoLabel('Córdoba, Argentina')).toBe(DESTINO_EXTERIOR)
  })

  // Lima está llena de avenidas con nombre de país: Brasil, Argentina, Canadá,
  // Colombia, Venezuela. Si el país pesara en cualquier posición, cada dirección
  // de Google Places sobre una de ellas saldría del país.
  it('una avenida con nombre de país sigue siendo Perú', () => {
    expect(departamentoLabel('Av. Brasil 1234, Jesús María, Lima')).toBe('Lima')
    expect(departamentoLabel('Av. Argentina 500, Callao')).toBe('Callao')
    expect(departamentoLabel('Av. Canadá, San Borja, Lima')).toBe('Lima')
  })
})

describe('departamentoLabel', () => {
  it('etiqueta los destinos irresolubles', () => {
    expect(departamentoLabel('Etapas suplencia VD-124')).toBe(
      DEPARTAMENTO_DESCONOCIDO
    )
    expect(departamentoLabel('Tarapoto')).toBe('San Martín')
  })
})
