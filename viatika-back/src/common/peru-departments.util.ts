/**
 * Resolución del departamento peruano a partir del destino que guarda la
 * solicitud (`viaticoPlace`), que es texto libre: unas veces viene de Google
 * Places ("Av. Larco 123, Miraflores, Lima") y otras lo teclea el colaborador
 * ("Hotel Bolognesi Tacna").
 *
 * El dashboard agrupa y filtra por departamento y no existe un campo
 * persistido para ello. Se resuelve aquí sobre el texto en vez de migrar un
 * campo nuevo porque así también queda cubierto el histórico: los destinos ya
 * cargados no tienen de dónde sacar el departamento.
 */

/** Los 24 departamentos + la Provincia Constitucional del Callao. */
export const PERU_DEPARTAMENTOS = [
  'Amazonas',
  'Áncash',
  'Apurímac',
  'Arequipa',
  'Ayacucho',
  'Cajamarca',
  'Callao',
  'Cusco',
  'Huancavelica',
  'Huánuco',
  'Ica',
  'Junín',
  'La Libertad',
  'Lambayeque',
  'Lima',
  'Loreto',
  'Madre de Dios',
  'Moquegua',
  'Pasco',
  'Piura',
  'Puno',
  'San Martín',
  'Tacna',
  'Tumbes',
  'Ucayali',
] as const

export type PeruDepartamento = (typeof PERU_DEPARTAMENTOS)[number]

/** Etiqueta de agrupación para los destinos que no resuelven a un departamento. */
export const DEPARTAMENTO_DESCONOCIDO = 'Sin departamento'

/**
 * Ciudades, provincias y distritos → departamento. Solo hace falta lo que NO
 * coincide con el nombre del departamento (esos se agregan solos más abajo):
 * capitales de provincia, distritos de Lima/Callao y los destinos que aparecen
 * en la operación.
 */
const ALIAS: Record<string, PeruDepartamento> = {
  // Amazonas
  chachapoyas: 'Amazonas',
  bagua: 'Amazonas',
  'bagua grande': 'Amazonas',
  utcubamba: 'Amazonas',
  // Áncash
  huaraz: 'Áncash',
  chimbote: 'Áncash',
  'nuevo chimbote': 'Áncash',
  casma: 'Áncash',
  huarmey: 'Áncash',
  caraz: 'Áncash',
  yungay: 'Áncash',
  // Apurímac
  abancay: 'Apurímac',
  andahuaylas: 'Apurímac',
  // Arequipa
  mollendo: 'Arequipa',
  camana: 'Arequipa',
  islay: 'Arequipa',
  'cerro colorado': 'Arequipa',
  'jose luis bustamante y rivero': 'Arequipa',
  yanahuara: 'Arequipa',
  cayma: 'Arequipa',
  // Ayacucho
  huanta: 'Ayacucho',
  huamanga: 'Ayacucho',
  // Cajamarca
  jaen: 'Cajamarca',
  cajabamba: 'Cajamarca',
  celendin: 'Cajamarca',
  chota: 'Cajamarca',
  cutervo: 'Cajamarca',
  bambamarca: 'Cajamarca',
  // Callao
  bellavista: 'Callao',
  'la perla': 'Callao',
  ventanilla: 'Callao',
  'carmen de la legua': 'Callao',
  'mi peru': 'Callao',
  // Cusco
  cuzco: 'Cusco',
  sicuani: 'Cusco',
  quillabamba: 'Cusco',
  urubamba: 'Cusco',
  'machu picchu': 'Cusco',
  'aguas calientes': 'Cusco',
  espinar: 'Cusco',
  wanchaq: 'Cusco',
  'san sebastian': 'Cusco',
  // Huancavelica
  lircay: 'Huancavelica',
  // Huánuco
  'tingo maria': 'Huánuco',
  'rupa rupa': 'Huánuco',
  ambo: 'Huánuco',
  // Ica
  chincha: 'Ica',
  'chincha alta': 'Ica',
  pisco: 'Ica',
  nazca: 'Ica',
  nasca: 'Ica',
  palpa: 'Ica',
  // Junín
  huancayo: 'Junín',
  tarma: 'Junín',
  jauja: 'Junín',
  satipo: 'Junín',
  'la merced': 'Junín',
  chanchamayo: 'Junín',
  pichanaki: 'Junín',
  concepcion: 'Junín',
  'el tambo': 'Junín',
  // La Libertad
  trujillo: 'La Libertad',
  otuzco: 'La Libertad',
  pacasmayo: 'La Libertad',
  chepen: 'La Libertad',
  viru: 'La Libertad',
  ascope: 'La Libertad',
  huamachuco: 'La Libertad',
  'sanchez carrion': 'La Libertad',
  // Lambayeque
  chiclayo: 'Lambayeque',
  ferrenafe: 'Lambayeque',
  motupe: 'Lambayeque',
  olmos: 'Lambayeque',
  'jose leonardo ortiz': 'Lambayeque',
  // Lima (provincias y distritos)
  barranca: 'Lima',
  huacho: 'Lima',
  huaura: 'Lima',
  canete: 'Lima',
  'san vicente de canete': 'Lima',
  huaral: 'Lima',
  matucana: 'Lima',
  yauyos: 'Lima',
  miraflores: 'Lima',
  'san isidro': 'Lima',
  'san borja': 'Lima',
  'la molina': 'Lima',
  surco: 'Lima',
  'santiago de surco': 'Lima',
  barranco: 'Lima',
  chorrillos: 'Lima',
  'san miguel': 'Lima',
  magdalena: 'Lima',
  'magdalena del mar': 'Lima',
  'pueblo libre': 'Lima',
  'jesus maria': 'Lima',
  lince: 'Lima',
  'la victoria': 'Lima',
  surquillo: 'Lima',
  ate: 'Lima',
  'ate vitarte': 'Lima',
  'santa anita': 'Lima',
  'san juan de lurigancho': 'Lima',
  'san juan de miraflores': 'Lima',
  'villa el salvador': 'Lima',
  'villa maria del triunfo': 'Lima',
  comas: 'Lima',
  'los olivos': 'Lima',
  independencia: 'Lima',
  'san martin de porres': 'Lima',
  rimac: 'Lima',
  brena: 'Lima',
  'cercado de lima': 'Lima',
  'lima cercado': 'Lima',
  chaclacayo: 'Lima',
  lurigancho: 'Lima',
  chosica: 'Lima',
  lurin: 'Lima',
  pachacamac: 'Lima',
  'punta hermosa': 'Lima',
  'el agustino': 'Lima',
  'puente piedra': 'Lima',
  carabayllo: 'Lima',
  ancon: 'Lima',
  // Loreto
  iquitos: 'Loreto',
  yurimaguas: 'Loreto',
  nauta: 'Loreto',
  'alto amazonas': 'Loreto',
  maynas: 'Loreto',
  requena: 'Loreto',
  contamana: 'Loreto',
  // Madre de Dios
  'puerto maldonado': 'Madre de Dios',
  tambopata: 'Madre de Dios',
  // Moquegua
  ilo: 'Moquegua',
  'mariscal nieto': 'Moquegua',
  // Pasco
  'cerro de pasco': 'Pasco',
  oxapampa: 'Pasco',
  'villa rica': 'Pasco',
  yanacancha: 'Pasco',
  // Piura
  sullana: 'Piura',
  talara: 'Piura',
  paita: 'Piura',
  chulucanas: 'Piura',
  sechura: 'Piura',
  catacaos: 'Piura',
  'veintiseis de octubre': 'Piura',
  // Puno
  juliaca: 'Puno',
  ilave: 'Puno',
  desaguadero: 'Puno',
  ayaviri: 'Puno',
  azangaro: 'Puno',
  'san roman': 'Puno',
  // San Martín
  tarapoto: 'San Martín',
  moyobamba: 'San Martín',
  rioja: 'San Martín',
  juanjui: 'San Martín',
  tocache: 'San Martín',
  'la banda de shilcayo': 'San Martín',
  morales: 'San Martín',
  // Tacna
  'alto de la alianza': 'Tacna',
  'ciudad nueva': 'Tacna',
  'gregorio albarracin': 'Tacna',
  // Tumbes
  zarumilla: 'Tumbes',
  'aguas verdes': 'Tumbes',
  zorritos: 'Tumbes',
  'puerto pizarro': 'Tumbes',
  // Ucayali
  pucallpa: 'Ucayali',
  'coronel portillo': 'Ucayali',
  yarinacocha: 'Ucayali',
  manantay: 'Ucayali',
  aguaytia: 'Ucayali',
  atalaya: 'Ucayali',
}

/** Quita tildes, pasa a minúsculas y colapsa puntuación/espacios. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Palabras que acompañan al nombre del lugar y estorban al comparar el
 * segmento completo ("Distrito de Miraflores", "Dpto. Lima").
 */
const RUIDO =
  /\b(destino|ciudad|provincia|departamento|dpto|dep|region|distrito|peru|av|avenida|jr|jiron|calle|urb|urbanizacion|mz|lt|lote|km|carretera|hotel|hostal|oficina)\b/g

/** Diccionario final: alias + cada departamento apuntándose a sí mismo. */
const LOOKUP: Record<string, PeruDepartamento> = (() => {
  const map: Record<string, PeruDepartamento> = {}
  for (const dep of PERU_DEPARTAMENTOS) map[normalize(dep)] = dep
  // Variantes de escritura que `normalize` no unifica por sí sola.
  Object.assign(map, {
    'prov const del callao': 'Callao' as PeruDepartamento,
    'provincia constitucional del callao': 'Callao' as PeruDepartamento,
    'lima metropolitana': 'Lima' as PeruDepartamento,
    'lima province': 'Lima' as PeruDepartamento,
    'lima region': 'Lima' as PeruDepartamento,
  })
  for (const [alias, dep] of Object.entries(ALIAS)) map[normalize(alias)] = dep
  return map
})()

/** Claves de más larga a más corta: "san juan de miraflores" antes que "miraflores". */
const LOOKUP_KEYS = Object.keys(LOOKUP).sort((a, b) => b.length - a.length)

/**
 * Departamento del destino, o `null` si el texto no permite deducirlo.
 *
 * Los segmentos separados por coma se recorren de derecha a izquierda porque
 * una dirección va de lo específico a lo general ("Av. Larco 123, Miraflores,
 * Lima"): el segmento reconocible más a la derecha es el más cercano al
 * departamento.
 */
export function resolveDepartamento(
  place?: string | null
): PeruDepartamento | null {
  if (!place) return null

  const segments = place
    .split(',')
    .map(s =>
      normalize(s)
        .replace(RUIDO, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)

  for (let i = segments.length - 1; i >= 0; i--) {
    const hit = LOOKUP[segments[i]]
    if (hit) return hit
  }

  // Sin coincidencia por segmento: se busca cualquier alias contenido en el
  // texto completo ("Hotel Bolognesi Tacna", "Iquitos-Loreto").
  const full = normalize(place)
  for (const key of LOOKUP_KEYS) {
    // Límite de palabra a ambos lados para no cazar "ate" dentro de "matecito".
    if (new RegExp(`(^|\\s)${key}(\\s|$)`).test(full)) return LOOKUP[key]
  }

  return null
}

/** Igual que `resolveDepartamento`, pero devuelve la etiqueta de agrupación. */
export function departamentoLabel(place?: string | null): string {
  return resolveDepartamento(place) ?? DEPARTAMENTO_DESCONOCIDO
}

/**
 * Coordenadas de la capital de cada departamento, para plotear el mapa sin
 * geocodificar. Antes el front pedía a Google la posición de cada dirección
 * suelta: fallaba con los destinos tecleados a mano y gastaba cuota por algo
 * que a nivel de departamento es una constante.
 */
export const DEPARTAMENTO_COORDS: Record<string, { lat: number; lng: number }> =
  {
    Amazonas: { lat: -6.2299, lng: -77.8697 },
    Áncash: { lat: -9.5278, lng: -77.5278 },
    Apurímac: { lat: -13.6354, lng: -72.8814 },
    Arequipa: { lat: -16.409, lng: -71.5375 },
    Ayacucho: { lat: -13.1588, lng: -74.2236 },
    Cajamarca: { lat: -7.1639, lng: -78.5003 },
    Callao: { lat: -12.0565, lng: -77.1181 },
    Cusco: { lat: -13.532, lng: -71.9675 },
    Huancavelica: { lat: -12.7842, lng: -74.9731 },
    Huánuco: { lat: -9.9306, lng: -76.2401 },
    Ica: { lat: -14.0674, lng: -75.7286 },
    Junín: { lat: -12.0651, lng: -75.2049 },
    'La Libertad': { lat: -8.112, lng: -79.0288 },
    Lambayeque: { lat: -6.7714, lng: -79.8409 },
    Lima: { lat: -12.0464, lng: -77.0428 },
    Loreto: { lat: -3.7491, lng: -73.2538 },
    'Madre de Dios': { lat: -12.5931, lng: -69.1891 },
    Moquegua: { lat: -17.1939, lng: -70.9355 },
    Pasco: { lat: -10.6882, lng: -76.2588 },
    Piura: { lat: -5.1945, lng: -80.6328 },
    Puno: { lat: -15.8402, lng: -70.0219 },
    'San Martín': { lat: -6.034, lng: -76.9724 },
    Tacna: { lat: -18.0146, lng: -70.2536 },
    Tumbes: { lat: -3.5669, lng: -80.4515 },
    Ucayali: { lat: -8.3791, lng: -74.5539 },
  }
