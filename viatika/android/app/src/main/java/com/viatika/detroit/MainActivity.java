package com.viatika.detroit;

import android.Manifest;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * El teclado se resuelve enteramente con windowSoftInputMode="adjustResize" en
 * el manifest, que es lo que faltaba: sin esa linea el sistema elegia
 * SOFT_INPUT_ADJUST_PAN y desplazaba la ventana entera.
 *
 * NO agregar aqui un listener de insets ni uno de OnGlobalLayout para encoger la
 * WebView: el sistema ya la encogio y el padding extra la encoge por segunda vez.
 * Comprobado en el emulador con Android 14: con adjustResize solo, la ventana
 * pasa de 778 a 499 px y el contenido llena el area visible; agregando el
 * listener bajaba a 196 px y quedaba un bloque vacio sobre el teclado.
 *
 * En Android 15+ el sistema ignora adjustResize por el edge-to-edge, pero ahi lo
 * cubre Capacitor (ver SystemBars.initSafeAreaCSSVariables, condicionado a
 * API 35+ o WebView 140+).
 */
public class MainActivity extends BridgeActivity {

    private static final int PERMISO_ALMACENAMIENTO = 4001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new PuenteDescargas(), "DetroitDescargas");
    }

    /**
     * Guarda un archivo en la carpeta Descargas del equipo.
     *
     * La app genera los PDF y Excel en el navegador como Blob, y un
     * `<a download href="blob:...">` no descarga nada dentro de un WebView. La
     * alternativa de compartirlo abre el menu de "Compartir", que no es lo que
     * espera quien pulsa "Descargar".
     *
     * Desde Android 10 no se puede escribir en la carpeta publica con la API de
     * ficheros por el almacenamiento delimitado, asi que se pasa por MediaStore,
     * que ademas no exige permiso. En Android 9 y anteriores se escribe directo
     * con WRITE_EXTERNAL_STORAGE, declarado en el manifest con maxSdkVersion 28.
     */
    public class PuenteDescargas {

        @JavascriptInterface
        public String guardarEnDescargas(String nombre, String tipoMime, String base64) {
            try {
                // En Android 9 y anteriores escribir en Descargas exige permiso; desde
                // Android 10 se pasa por MediaStore y el sistema ya no lo pide.
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && !tienePermisoAlmacenamiento()) {
                    pedirPermisoAlmacenamiento();
                    return "sin_permiso";
                }

                byte[] datos = Base64.decode(base64, Base64.DEFAULT);
                String tipo = (tipoMime == null || tipoMime.isEmpty()) ? "application/octet-stream" : tipoMime;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    guardarConMediaStore(nombre, tipo, datos);
                } else {
                    guardarEnCarpetaPublica(nombre, datos);
                }

                avisar("Guardado en Descargas: " + nombre);
                return "ok";
            } catch (Exception e) {
                return "error: " + e.getMessage();
            }
        }

        private void guardarConMediaStore(String nombre, String tipo, byte[] datos) throws Exception {
            ContentValues valores = new ContentValues();
            valores.put(MediaStore.Downloads.DISPLAY_NAME, nombre);
            valores.put(MediaStore.Downloads.MIME_TYPE, tipo);
            valores.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri destino = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores);
            if (destino == null) {
                throw new IllegalStateException("MediaStore no devolvio destino");
            }

            try (OutputStream salida = getContentResolver().openOutputStream(destino)) {
                if (salida == null) {
                    throw new IllegalStateException("No se pudo abrir el destino");
                }
                salida.write(datos);
            }

            valores.clear();
            valores.put(MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(destino, valores, null, null);
        }

        private void guardarEnCarpetaPublica(String nombre, byte[] datos) throws Exception {
            File carpeta = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!carpeta.exists() && !carpeta.mkdirs()) {
                throw new IllegalStateException("No se pudo crear la carpeta Descargas");
            }
            try (FileOutputStream salida = new FileOutputStream(new File(carpeta, nombre))) {
                salida.write(datos);
            }
        }

        private boolean tienePermisoAlmacenamiento() {
            return ContextCompat.checkSelfPermission(
                MainActivity.this,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED;
        }

        private void pedirPermisoAlmacenamiento() {
            runOnUiThread(() ->
                ActivityCompat.requestPermissions(
                    MainActivity.this,
                    new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE },
                    PERMISO_ALMACENAMIENTO
                )
            );
        }

        private void avisar(final String mensaje) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, mensaje, Toast.LENGTH_LONG).show());
        }
    }
}
