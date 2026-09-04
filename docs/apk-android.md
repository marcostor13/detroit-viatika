# APK Android (Capacitor)

El frontend Angular se empaqueta como app nativa con Capacitor 8. El proyecto
nativo vive en `viatika/android/` y los assets web se copian dentro del APK, asi
que **cada cambio del front exige regenerar el APK**.

## Configuracion

- `viatika/capacitor.config.ts`: appId `com.viatika.detroit`, appName `Detroit`,
  webDir `dist/gastos/browser`.
- minSdk 24 (Android 7), targetSdk/compileSdk 36.
- Unico permiso: `INTERNET`. La camara y el explorador de archivos funcionan por
  el `FileProvider` del bridge de Capacitor, sin permiso `CAMERA` declarado.

## Regenerar el APK de produccion

```bash
cd viatika

# 1. Build de Angular apuntando al API de produccion
API_URL=https://apidetroit.viatika.tecdidata.com/api npm run build

# 2. Copiar los assets web al proyecto nativo
#    APP_HOSTNAME define el origen con el que la WebView sirve la app; tiene que
#    ser uno de los dominios que acepta el bucket de S3 (ver nota mas abajo).
APP_HOSTNAME=detroit.viatika.tecdidata.com npx cap copy android

# 3. Compilar el APK de debug
cd android
JAVA_HOME="/c/Program Files/Java/jdk-18.0.2" ./gradlew assembleDebug
```

Salida: `viatika/android/app/build/outputs/apk/debug/app-debug.apk`

## Build de QA

Lo mismo, con el API de QA y el flag `-Pqa`:

```bash
cd viatika
API_URL=https://qa-apidetroit-viatika.tecdidata.com/api npm run build
APP_HOSTNAME=qa-detroit-viatika.tecdidata.com npx cap copy android
cd android
JAVA_HOME="/c/Program Files/Java/jdk-18.0.2" ./gradlew assembleDebug -Pqa
```

`-Pqa` cambia el applicationId a `com.viatika.detroit.qa` y el nombre visible a
"Detroit QA", asi que el APK de QA y el de produccion se instalan en paralelo en
el mismo celular sin pisarse. Ver `manifestPlaceholders` en
`android/app/build.gradle`; el label del manifest es `${appLabel}`.

Ambos builds escriben en la misma ruta `app-debug.apk`, hay que copiar el
archivo antes de lanzar el otro build.

## Por que el `JAVA_HOME` explicito

Gradle 8.14.3 corre con JDK 8-24, pero el `JAVA_HOME` de la maquina apunta a
JDK 25 y falla. A la vez Capacitor 8 compila con `source release 21`, que el
JDK 18 no soporta. La solucion es lanzar Gradle con el JDK 18 y dejar que
descargue por si solo un JDK 21 para compilar:

- `android/settings.gradle` aplica `foojay-resolver-convention`.
- `android/build.gradle` fija `toolchain { languageVersion = 21 }` en todos los
  modulos Android.

Si se instala un JDK 21-24 en la maquina, basta con apuntar `JAVA_HOME` ahi y
el toolchain lo usa sin descargar nada.

## Notas

- El `API_URL` del `.env` (`apiviatikadetroit.marcostorresalarcon.com`) responde
  503. Los hosts vivos son `apidetroit.viatika.tecdidata.com` (produccion) y
  `qa-apidetroit-viatika.tecdidata.com` (QA).
- El APK de debug se instala directo en el celular (hay que habilitar
  "origenes desconocidos"). Para Play Store hace falta un release firmado con
  keystore propio.
- Iconos y splash salen del emblema de `public/logo_header.png`. Las fuentes
  estan en `viatika/assets/` (icon.png 1024x1024, splash.png 2732x2732) y se
  regeneran con:
  `npx @capacitor/assets generate --android --iconBackgroundColor '#ffffff' --splashBackgroundColor '#ffffff'`
- El teclado se resuelve **solo** con `windowSoftInputMode="adjustResize"` en el
  manifest. Sin esa linea el sistema elige `ADJUST_PAN` y desplaza la ventana
  entera. NO agregar ademas un listener de insets ni de OnGlobalLayout en
  `MainActivity` para encoger la WebView: el sistema ya la encogio y el padding
  extra la encoge por segunda vez. Medido en el emulador con Android 14: con
  `adjustResize` solo, la ventana pasa de 778 a 499 px y el contenido llena el
  area visible; con el listener bajaba a 196 px y dejaba un bloque vacio sobre el
  teclado. En Android 15+ el sistema ignora `adjustResize`, pero ahi lo cubre
  Capacitor (`SystemBars`).
- Si Gradle falla con un `NoClassDefFoundError` raro (por ejemplo
  `com/google/gson/TypeAdapter`), es un jar truncado en la cache
  (`D:\Android\.gradle\caches\modules-2`) por un corte de energia: borrar el
  artefacto, correr `./gradlew --stop` y reintentar.
- Camara en los adjuntos: Capacitor abre la camara solo si el `<input type="file">`
  declara `accept="image/*"` junto con `capture` (ver `onShowFileChooser` en
  `BridgeWebChromeClient`). Como los comprobantes tambien aceptan PDF, el input
  del selector usa `accept="*/*"` y hay un segundo input oculto solo para la
  foto, con su boton "Tomar foto" (`add-invoice.component.html`).
- El login muestra un distintivo "Entorno de pruebas" con el host del backend
  cuando el API no es el de produccion, para no confundir el APK de QA con el otro.

## El origen de la WebView y la subida de comprobantes

Los comprobantes no pasan por el backend: el front pide una URL prefirmada y
hace `PUT` directo al bucket de S3 (`upload.service.ts`). Ese bucket solo acepta
como origen los dominios del frontend, comprobado con una peticion de
verificacion previa:

| Origen | Respuesta de S3 |
|---|---|
| `https://localhost` (el que usa Capacitor por defecto) | 403 Forbidden |
| `https://qa-detroit-viatika.tecdidata.com` | 200 OK |
| `https://detroit.viatika.tecdidata.com` | 200 OK |

Por eso en el APK la validacion SUNAT funcionaba (va al backend, con CORS
abierto) pero subir la factura fallaba con "Error de red al subir el archivo".

La solucion actual es `server.hostname` en `capacitor.config.ts`, alimentado por
`APP_HOSTNAME`: la WebView sigue sirviendo los archivos locales, pero declara un
origen que el bucket si acepta. Hay que pasar el dominio que corresponda al
entorno con el que se compila.

**Lo correcto seria** agregar `https://localhost` y `capacitor://localhost` (iOS)
a la politica CORS del bucket y quitar el `hostname`. Mientras tanto, ojo con dos
cosas: el `localStorage` vive por origen, asi que al cambiar el hostname se
pierde la sesion guardada una vez; y si el dominio del frontend cambia, hay que
actualizar tambien este valor.
