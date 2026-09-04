import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { NotificationService } from './notification.service';

/** Interfaz nativa que expone MainActivity para guardar en Descargas. */
interface PuenteDescargas {
  guardarEnDescargas(nombre: string, tipoMime: string, base64: string): string;
}

/**
 * Rescata las descargas y las vistas previas dentro del APK.
 *
 * Toda la app exporta igual: jsPDF o ExcelJS arman un Blob, se crea un
 * `<a download href="blob:...">` y se le hace click. En un navegador eso baja
 * el archivo, pero el WebView de Android solo entrega al DownloadListener las
 * URL http(s) y Capacitor ni siquiera registra uno, asi que el click no hace
 * absolutamente nada: ni archivo, ni error, ni aviso.
 *
 * Lo mismo pasa con `window.open('blob:...')` que se usa para previsualizar un
 * comprobante antes de subirlo.
 *
 * Como el patron esta repetido en una decena de componentes, en vez de tocarlos
 * uno por uno se intercepta en el prototipo: si el destino es un blob o un data
 * URL, el archivo se guarda en la carpeta Descargas del equipo mediante el
 * puente nativo (PuenteDescargas en MainActivity.java), igual que cualquier
 * archivo bajado. Si ese puente no existe se recurre al menu de compartir.
 *
 * Solo se activa dentro del APK; en el navegador no se toca nada.
 */
@Injectable({ providedIn: 'root' })
export class DescargaNativaService {
  private notificationService = inject(NotificationService);
  private instalado = false;

  instalar(): void {
    if (this.instalado || !Capacitor.isNativePlatform()) return;
    this.instalado = true;

    const servicio = this;

    const clickOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      const destino = this.getAttribute('href') ?? '';
      if (this.hasAttribute('download') && servicio.esLocal(destino)) {
        void servicio.guardarYCompartir(destino, this.getAttribute('download') || 'archivo');
        return;
      }
      clickOriginal.call(this);
    };

    const openOriginal = window.open.bind(window);
    window.open = function (url?: string | URL, destino?: string, caracteristicas?: string) {
      const destinoUrl = typeof url === 'string' ? url : url?.toString() ?? '';
      if (servicio.esLocal(destinoUrl)) {
        void servicio.guardarYCompartir(destinoUrl, 'documento');
        return null;
      }
      return openOriginal(url as string, destino, caracteristicas);
    } as typeof window.open;
  }

  /** Blob y data URL viven solo dentro del WebView: Android no sabe abrirlos. */
  private esLocal(url: string): boolean {
    return /^(blob:|data:)/i.test(url);
  }

  private async guardarYCompartir(url: string, nombre: string): Promise<void> {
    try {
      const blob = await (await fetch(url)).blob();
      const archivo = this.conExtension(nombre, blob.type);
      const base64 = await this.aBase64(blob);

      // Camino normal: queda en Descargas, como cualquier archivo bajado.
      const puente = (window as unknown as { DetroitDescargas?: PuenteDescargas })
        .DetroitDescargas;
      if (puente?.guardarEnDescargas) {
        const resultado = puente.guardarEnDescargas(archivo, blob.type || '', base64);
        if (resultado === 'ok') return;
        if (resultado === 'sin_permiso') {
          // Android 9 y anteriores: se acaba de pedir el permiso. Esta vez el
          // archivo sale por el menu de compartir para no perder la accion.
          this.notificationService.show(
            'Concede el permiso de almacenamiento para que se guarde en Descargas',
            'warning'
          );
        } else {
          console.warn('No se pudo guardar en Descargas, se comparte:', resultado);
        }
      }

      // Respaldo: dejarlo en la cache y ofrecerlo por el menu de compartir.
      const { uri } = await Filesystem.writeFile({
        path: archivo,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({ title: archivo, files: [uri] });
    } catch (error) {
      // Cerrar el menu de compartir sin elegir nada llega aqui como error.
      if (this.esCancelacion(error)) return;
      this.notificationService.show('No se pudo preparar el archivo', 'error');
    }
  }

  /** El nombre de `window.open` viene sin extension y Android la necesita. */
  private conExtension(nombre: string, tipo: string): string {
    if (nombre.includes('.')) return nombre;
    const porTipo: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'text/csv': 'csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    };
    const extension = porTipo[tipo] ?? 'bin';
    return `${nombre}.${extension}`;
  }

  private esCancelacion(error: unknown): boolean {
    const mensaje = error instanceof Error ? error.message : String(error);
    return /cancel/i.test(mensaje);
  }

  private aBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onerror = () => reject(lector.error);
      lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '');
      lector.readAsDataURL(blob);
    });
  }
}
