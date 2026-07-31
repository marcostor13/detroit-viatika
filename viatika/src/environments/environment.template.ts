// Plantilla de referencia. Los archivos reales environment.ts / environment.prod.ts
// se generan en build-time con scripts/set-env.js a partir de variables de entorno
// y estan ignorados en git. Ver .env.example para la lista de variables.
export const environment = {
  production: false,
  api: 'http://localhost:3016/api',
  storage: 'user-data-ls-gastos',
  storagePath: 'gastos-images',
  googleMapsApiKey: '',
};
