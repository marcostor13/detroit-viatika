package com.viatika.detroit;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Por debajo de esta fraccion de la pantalla no se considera teclado. */
    private static final float FRACCION_MINIMA_TECLADO = 0.15f;

    /**
     * Encoge la WebView cuando aparece el teclado.
     *
     * Ni windowSoftInputMode="adjustResize" ni los insets sirven en todos los
     * equipos: hay lanzadores que desplazan la ventana entera hacia arriba sin
     * que la WebView se entere (visualViewport tampoco lo reporta), y ahi la
     * pantalla queda a medias con un bloque vacio abajo.
     *
     * getWindowVisibleDisplayFrame si devuelve el area visible en todos los
     * casos y en cualquier version, asi que se mide en cada layout y la
     * diferencia se aplica como padding inferior.
     *
     * En Android 15+ esto lo resuelve Capacitor (ver SystemBars), asi que no se
     * toca para no aplicar el padding dos veces. Si adjustResize funciona, la
     * ventana ya llega encogida y la diferencia medida es cero: no estorba.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= 35) {
            return;
        }

        final View content = findViewById(android.R.id.content);
        if (content == null) {
            return;
        }

        content.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            Rect visible = new Rect();
            content.getWindowVisibleDisplayFrame(visible);

            int altoPantalla = content.getRootView().getHeight();
            int tapado = altoPantalla - visible.bottom;
            int padding = tapado > altoPantalla * FRACCION_MINIMA_TECLADO ? tapado : 0;

            if (content.getPaddingBottom() != padding) {
                content.setPadding(0, 0, 0, padding);
            }
        });
    }
}
