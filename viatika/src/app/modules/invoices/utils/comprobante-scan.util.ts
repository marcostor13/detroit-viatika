/**
 * Helpers del escaneo de comprobantes (VD-70): normalización del tipo, formato
 * de fechas entre el input y el backend, y los mensajes del estado SUNAT.
 *
 * Viven fuera del componente porque los usan dos pantallas: la carga de un
 * comprobante (`add-invoice`) y la carga masiva (`bulk-upload`). Sin esto, la
 * segunda tendría que copiar las reglas de la primera y las dos se irían
 * separando en cuanto una cambiara.
 */

/** Tipos de comprobante que SUNAT valida en el registro de gasto (VD-70). */
export const TIPOS_COMPROBANTE = ['Factura', 'Boleta'];

/** Único estado SUNAT que habilita guardar el comprobante. */
export const SUNAT_STATUS_VALIDO = 'VALIDO_ACEPTADO';

export const SUNAT_STATUS_MESSAGES: Record<string, string> = {
  VALIDO_ACEPTADO: 'Factura válida y emitida a la empresa.',
  VALIDO_NO_PERTENECE:
    'El comprobante no fue emitido a esta empresa. Verifica el RUC emisor.',
  NO_ENCONTRADO: 'Comprobante no encontrado en SUNAT.',
  ERROR_SUNAT:
    'Error en el servicio de SUNAT. Revisa los datos e intenta de nuevo.',
  SUNAT_CONFIG_NOT_FOUND: 'No se encontró configuración SUNAT para esta empresa.',
  PENDING: 'Pendiente de validación con SUNAT.',
};

/** Mensaje legible de un estado SUNAT, incluido el estado ausente. */
export function sunatStatusMessage(status: string | null | undefined): string {
  if (!status) return 'Pendiente de validación con SUNAT.';
  return SUNAT_STATUS_MESSAGES[status] ?? `Estado SUNAT: ${status}`;
}

/**
 * Normaliza el tipo de comprobante que devuelve el OCR (texto libre, p. ej.
 * "Boleta Electrónica") a uno de los valores canónicos del selector, para que
 * SUNAT reciba el codComp correcto.
 */
export function normalizeTipoComprobante(raw?: string): string {
  const t = (raw ?? '').trim().toLowerCase();
  if (t.includes('boleta')) return 'Boleta';
  return 'Factura';
}

/**
 * Deriva el tipo del prefijo de la serie (VD-70): en los comprobantes
 * electrónicos la serie empieza con F (Factura) o B (Boleta) — es más
 * confiable que el texto del OCR. Series numéricas (físicos) u otras letras
 * devuelven null (se conserva el tipo actual / OCR / elección manual).
 */
export function deriveTipoFromSerie(serie?: string): string | null {
  const s = (serie ?? '').trim().toUpperCase();
  if (s.startsWith('F')) return 'Factura';
  if (s.startsWith('B')) return 'Boleta';
  return null;
}

/** Pasa cualquier fecha del OCR al formato `yyyy-MM-dd` que espera un input date. */
export function formatDateForInput(dateValue: any): string {
  if (!dateValue) return '';

  let date: Date;

  if (typeof dateValue === 'string') {
    const dateStr = dateValue.trim();

    if (dateStr.match(/^\d{2}[-\/]\d{2}[-\/]\d{4}$/)) {
      const parts = dateStr.split(/[-\/]/);
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      date = new Date(year, month, day);
    } else if (dateStr.match(/^\d{4}[-\/]\d{2}[-\/]\d{2}$/)) {
      date = new Date(dateStr);
    } else {
      date = new Date(dateStr);
    }
  } else {
    date = new Date(dateValue);
  }

  if (isNaN(date.getTime())) {
    console.warn('Fecha inválida:', dateValue);
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Pasa la fecha del input (`yyyy-MM-dd`) al `dd/MM/yyyy` que espera el backend. */
export function formatDateForBackend(dateValue: string): string {
  if (!dateValue) return '';

  if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const parts = dateValue.split('-');
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    return `${day}/${month}/${year}`;
  }

  if (dateValue.match(/^\d{2}[-\/]\d{2}[-\/]\d{4}$/)) {
    return dateValue.replace(/-/g, '/');
  }

  const date = new Date(dateValue);
  if (isNaN(date.getTime())) {
    console.warn('Fecha inválida para backend:', dateValue);
    return dateValue;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${day}/${month}/${year}`;
}

/** Los cuatro datos sin los que SUNAT no puede consultar el comprobante. */
export function puedeValidarConSunat(datos: {
  rucEmisor?: string;
  serie?: string;
  correlativo?: string;
  fechaEmision?: string;
}): boolean {
  return !!(
    datos.rucEmisor &&
    datos.serie &&
    datos.correlativo &&
    datos.fechaEmision
  );
}
