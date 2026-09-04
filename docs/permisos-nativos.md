# Permisos nativos: Android e iOS

Revision hecha sobre todo `viatika/src/app` buscando las APIs del navegador que
tocan hardware o sistema, y sobre los 35 `<input type="file">` de la app (5 con `capture`, 7 de imagen sin
`capture` y 23 de documento).
Estado al 31-ago-2026.

## Resumen: que usa la app de verdad

| Capacidad | La app la usa | Android | iOS |
|---|---|---|---|
| Red (API, S3, fuentes, Google Maps) | Si | `INTERNET` ya declarado | Nada. El API es HTTPS, no hace falta excepcion de ATS |
| Tomar foto de un comprobante | Si, 5 inputs con `accept="image/*"` + `capture` | `CAMERA` + `<queries>` con `IMAGE_CAPTURE` | `NSCameraUsageDescription` **obligatorio** |
| Elegir imagen de la galeria | Si, 7 inputs con `accept="image/*"` sin `capture` (logos, firma, foto de perfil) | Nada: el selector usa el Storage Access Framework | `NSPhotoLibraryUsageDescription` recomendado |
| Adjuntar PDF / Excel | Si, 23 inputs | Nada | Nada |
| Descargar PDF y Excel generados | Si, 10 componentes | Nada: se escribe en la cache de la app y se abre el menu de compartir | Nada: `UIActivityViewController` |
| Portapapeles | Si, solo `writeText` (contrasenas temporales) | Nada | Nada |
| Geolocalizacion / GPS | **No** | — | — |
| Microfono, video, audio | **No** | — | — |
| Notificaciones push | **No**, no hay plugin ni tokens de dispositivo | — | — |
| Contactos, calendario, Bluetooth, biometria | **No** | — | — |

## Android: lo que esta declarado

En `viatika/android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />

<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

<queries>
    <intent>
        <action android:name="android.media.action.IMAGE_CAPTURE" />
    </intent>
</queries>
```

Tres detalles que no son obvios:

1. **El `<queries>` no es opcional desde Android 11.** Capacitor abre la camara
   con `takePictureIntent.resolveActivity(packageManager)`; sin declarar el
   intent, una app no "ve" la app de camara, `resolveActivity` devuelve `null`,
   Capacitor concluye que no hay camara y cae al selector de archivos **sin
   ningun aviso**. Es un fallo silencioso, muy dificil de diagnosticar.

2. **Declarar `CAMERA` cambia el comportamiento.** Sin declararlo, la camara se
   abre sin preguntar nada (lanzar `ACTION_IMAGE_CAPTURE` no exige el permiso).
   Al declararlo, Capacitor lo pide en tiempo de ejecucion antes de abrirla; ver
   `isMediaCaptureSupported` en `BridgeWebChromeClient`. Se declaro a proposito,
   para que la app pida permiso como cualquier otra.

3. **No hace falta permiso de almacenamiento.** Los PDF y Excel se escriben en
   la cache de la app (`Directory.Cache`) y se entregan al menu de compartir, en
   vez de escribir en la carpeta publica de Descargas. Si algun dia se quisiera
   guardar directo en Descargas, en Android 9 y anteriores haria falta
   `WRITE_EXTERNAL_STORAGE` con `android:maxSdkVersion="28"`.

### Lo que NO hay que declarar

- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`: la app no llama a
  `navigator.geolocation` en ningun lado. El autocompletado de direcciones
  (`appPlacesAutocomplete`) es busqueda por texto contra Google Places, no usa
  GPS. Si algun dia se agrega un boton "usar mi ubicacion", ahi si.
- `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE`: el selector de archivos usa el
  Storage Access Framework, que no requiere permiso.
- `POST_NOTIFICATIONS`: la campana de la app es interna, no hay push.
- `RECORD_AUDIO`: ningun input captura video o audio.

## iOS: lo que haria falta

El proyecto **todavia no tiene plataforma iOS** (`viatika/ios/` no existe) y
compilarlo exige macOS con Xcode y CocoaPods. Cuando se agregue con
`npx cap add ios`, el `Info.plist` necesita:

```xml
<key>NSCameraUsageDescription</key>
<string>Se usa la camara para fotografiar comprobantes y adjuntarlos a una rendicion.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Se accede a tus fotos para adjuntar comprobantes, el logo de la empresa o tu foto de perfil.</string>
```

- `NSCameraUsageDescription` es **obligatorio**: iOS cierra la app de golpe si
  se abre la camara sin esa descripcion. En WKWebView un
  `<input type="file" accept="image/*">` ofrece "Tomar foto", asi que se dispara
  aunque no haya `capture`.
- `NSPhotoLibraryUsageDescription` es recomendable por los inputs de imagen sin
  `capture` (logo de empresa, firma, foto de perfil).
- `NSPhotoLibraryAddUsageDescription` NO hace falta: la app no guarda nada en el
  carrete.
- `NSMicrophoneUsageDescription` NO hace falta: ningun input captura video.
- `NSLocationWhenInUseUsageDescription` NO hace falta hoy, por lo mismo que en
  Android.
- Descargar y compartir no piden permiso en iOS.
- Si se quiere que los archivos aparezcan en la app Archivos, van
  `UIFileSharingEnabled` y `LSSupportsOpeningDocumentsInPlace` en `true`.

## Donde se puede tomar foto

Con `accept="image/*"` + `capture="environment"`, que es la unica combinacion
que hace que Capacitor abra la camara:

- Comprobante de factura, planilla de movilidad y otros gastos (`add-invoice`)
- Carga masiva de comprobantes (`bulk-upload`)
- Comprobante del fondo de caja chica (`caja-chica`)
- Voucher de devolucion (`mis-rendiciones` y `rendicion-detail`)
- Comprobante de reembolso (`rendicion-detail`)

En cada uno el selector de archivos sigue disponible aparte, porque tambien hay
que poder adjuntar un PDF.

Nota: `components/admin-add-invoice_backup/` tiene inputs de camara pero es
codigo muerto, ningun modulo lo importa.
