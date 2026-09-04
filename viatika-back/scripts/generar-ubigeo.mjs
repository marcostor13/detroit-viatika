/**
 * Genera `src/common/peru-ubigeo.data.ts` a partir del padron de ubigeo que ya
 * vive en el front (`viatika/src/app/constants/peru-locations.ts`), para no
 * mantener dos listas de lugares del Peru.
 *
 * Solo se emiten los nombres que apuntan a UN departamento. Los repetidos entre
 * departamentos ("Independencia" esta en Lima y en Huaraz, "San Miguel" en cinco
 * sitios) se descartan a proposito: adivinar el departamento equivocado es peor
 * que agrupar en "Sin departamento", porque el gasto termina contado en otra
 * region sin que nadie lo note.
 *
 *   node scripts/generar-ubigeo.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const ORIGEN = resolve(
  aqui,
  '../../viatika/src/app/constants/peru-locations.ts'
)
const DESTINO = resolve(aqui, '../src/common/peru-ubigeo.data.ts')

/** Misma normalizacion que peru-departments.util.ts. */
function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const fuente = readFileSync(ORIGEN, 'utf8')
const inicio = fuente.indexOf('PERU_LOCATIONS: Departamento[] = ')
if (inicio === -1) throw new Error('No se encontro PERU_LOCATIONS en ' + ORIGEN)
// El archivo sigue con funciones helper despues del arreglo, y sus tipos
// (`Provincia[]`) traen corchetes: hay que cortar en el cierre del literal, no
// en el ultimo corchete del archivo.
const desde = fuente.indexOf('[', inicio)
const cierre = fuente.indexOf('\n];', desde)
if (cierre === -1) throw new Error('No se encontro el cierre de PERU_LOCATIONS')
const departamentos = eval('(' + fuente.slice(desde, cierre + 2) + ')')

// nombre normalizado -> departamentos en los que aparece
const apariciones = new Map()
const anotar = (nombre, dep) => {
  const clave = normalize(nombre)
  if (!clave) return
  if (!apariciones.has(clave)) apariciones.set(clave, new Set())
  apariciones.get(clave).add(dep)
}

let provincias = 0
let distritos = 0
for (const dep of departamentos) {
  for (const prov of dep.provincias) {
    anotar(prov.label, dep.label)
    provincias++
    for (const dist of prov.distritos) {
      anotar(dist.label, dep.label)
      distritos++
    }
  }
}

// El nombre de un departamento manda sobre cualquier provincia o distrito que
// se llame igual (el distrito "La Libertad" de Huaraz no puede ganarle al
// departamento La Libertad).
const nombresDepartamento = new Set(departamentos.map(d => normalize(d.label)))

const unicos = {}
let descartados = 0
for (const [clave, deps] of [...apariciones].sort(([a], [b]) => a.localeCompare(b))) {
  if (nombresDepartamento.has(clave)) continue
  if (deps.size > 1) {
    descartados++
    continue
  }
  unicos[clave] = [...deps][0]
}

const cuerpo = Object.entries(unicos)
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  .join('\n')

writeFileSync(
  DESTINO,
  `/**
 * ARCHIVO GENERADO por scripts/generar-ubigeo.mjs - no editar a mano.
 *
 * Provincias y distritos del Peru que apuntan a un unico departamento, sacados
 * del padron de ubigeo del front (viatika/src/app/constants/peru-locations.ts).
 * Los nombres que se repiten entre departamentos quedan fuera: mandarlos al
 * departamento equivocado esconde el gasto en otra region.
 *
 * Origen: ${provincias} provincias y ${distritos} distritos.
 * ${Object.keys(unicos).length} nombres sin ambiguedad, ${descartados} descartados por repetirse.
 */
export const UBIGEO_A_DEPARTAMENTO: Record<string, string> = {
${cuerpo}
}
`,
  'utf8'
)

console.log(
  `${Object.keys(unicos).length} nombres unicos, ${descartados} ambiguos descartados -> ${DESTINO}`
)
