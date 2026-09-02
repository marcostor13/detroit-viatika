import {
  DEPARTAMENTO_DESCONOCIDO,
  departamentoLabel,
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
})

describe('departamentoLabel', () => {
  it('etiqueta los destinos irresolubles', () => {
    expect(departamentoLabel('Etapas suplencia VD-124')).toBe(
      DEPARTAMENTO_DESCONOCIDO
    )
    expect(departamentoLabel('Tarapoto')).toBe('San Martín')
  })
})
