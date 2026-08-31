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
npx cap copy android

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
npx cap copy android
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
- El teclado no debe desplazar la pantalla: `windowSoftInputMode="adjustResize"`
  en el manifest cubre Android 14 y anteriores, y `MainActivity` consume el inset
  del teclado para Android 15+ (donde ese modo se ignora por el edge-to-edge).
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
