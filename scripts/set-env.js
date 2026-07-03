// Genera src/environments/environment.ts y environment.prod.ts desde variables
// de entorno, para no versionar credenciales en el repositorio.
//
// Fuentes de configuracion (precedencia mayor a menor):
//   1. process.env  (CI / Docker build args / Coolify)
//   2. archivo .env en la raiz del frontend (solo desarrollo local)
//   3. valores por defecto no sensibles definidos aqui
//
// Se ejecuta automaticamente via los hooks "prestart" y "prebuild" de npm/pnpm.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_DIR = path.join(ROOT, 'src', 'environments');

// --- Cargar .env local (sin dependencias) -------------------------------------
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // process.env tiene prioridad, pero un valor vacio (ENV="" del Dockerfile
    // cuando no se pasa build arg) se trata como ausente y usa el .env.
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv();

// --- Lectura de variables -----------------------------------------------------
const REQUIRED = ['GOOGLE_MAPS_API_KEY'];

const e = (k, fallback = '') => {
  const val = process.env[k];
  return val !== undefined && val.trim() !== '' ? val.trim() : fallback;
};

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.warn(
    '[set-env] ADVERTENCIA: faltan variables de entorno: ' + missing.join(', ')
  );
  console.warn(
    '[set-env] Las claves correspondientes quedaran vacias. Define un .env local o variables de entorno en el build.'
  );
}

const googleMapsApiKey = e('GOOGLE_MAPS_API_KEY');

// Campos no sensibles (URL de API y claves de localStorage) con valores por defecto.
// API_URL_DEV -> environment.ts (ng serve / build development, uso local).
// API_URL     -> environment.prod.ts (build production: Coolify).
//                Define esta variable como "Build Variable" en Coolify.
const apiDev = e('API_URL_DEV', 'http://localhost:3016/api');
const apiProd = e('API_URL', 'https://apiviatika.marcostorresalarcon.com/api');
const storage = e('STORAGE_KEY', 'user-data-ls-gastos');
const storagePath = e('STORAGE_PATH', 'gastos-images');

// Advertencia explícita cuando se usa el valor por defecto en producción.
if (!process.env['API_URL']) {
  console.warn('[set-env] AVISO: API_URL no definida. Usando URL de produccion por defecto: ' + apiProd);
  console.warn('[set-env] En Coolify, marca API_URL como "Build Variable" para que esté disponible al compilar.');
}

// --- Render -------------------------------------------------------------------
function render(production, api) {
  const obj = {
    production,
    api,
    storage,
    storagePath,
    googleMapsApiKey,
  };
  return (
    '// ARCHIVO GENERADO por scripts/set-env.js - NO EDITAR NI VERSIONAR.\n' +
    'export const environment = ' +
    JSON.stringify(obj, null, 2) +
    ';\n'
  );
}

fs.mkdirSync(ENV_DIR, { recursive: true });
fs.writeFileSync(path.join(ENV_DIR, 'environment.ts'), render(false, apiDev));
fs.writeFileSync(path.join(ENV_DIR, 'environment.prod.ts'), render(true, apiProd));

console.log('[set-env] environment.ts  -> api: ' + apiDev);
console.log('[set-env] environment.prod.ts -> api: ' + apiProd);
