import type { CapacitorConfig } from '@capacitor/cli';

/**
 * El bucket de S3 solo acepta como origen los dominios del frontend. Dentro del
 * APK la WebView sirve la app desde `https://localhost`, que no esta en esa
 * lista, asi que la verificacion previa de CORS devuelve 403 y la subida de
 * comprobantes falla con "Error de red al subir el archivo" (los comprobantes
 * van directo a S3 con URL prefirmada, no pasan por el backend).
 *
 * Con `server.hostname` la WebView sirve los mismos archivos locales pero
 * declarando ese origen, que si esta permitido. El valor acompana al API con el
 * que se compila: APP_HOSTNAME lo fija el script de build.
 *
 * Lo ideal seria agregar `https://localhost` (y `capacitor://localhost` para
 * iOS) a la politica CORS del bucket y quitar esto.
 */
const config: CapacitorConfig = {
  appId: 'com.viatika.detroit',
  appName: 'Detroit',
  webDir: 'dist/gastos/browser',
  server: {
    androidScheme: 'https',
    hostname: process.env['APP_HOSTNAME'] || 'qa-detroit-viatika.tecdidata.com',
  },
};

export default config;
