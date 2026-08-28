/**
 * Adjuntos de respaldo de un comprobante.
 *
 * `file` guarda el primero y `attachments` la lista completa. Los tipos de
 * gasto que aceptan un solo archivo (factura, recibo, declaración jurada) y
 * todo lo cargado antes de que la planilla de movilidad y Otros Gastos
 * admitieran varios traen solo `file`; por eso se lee siempre por aquí y no
 * por uno de los dos campos.
 */
export function expenseAttachments(
  expense: Record<string, unknown> | null | undefined
): string[] {
  if (!expense) return [];
  const list = expense['attachments'];
  const urls = Array.isArray(list)
    ? list
        .filter((u): u is string => typeof u === 'string' && !!u.trim())
        .map((u) => u.trim())
    : [];
  if (urls.length) return urls;
  const single = expense['file'];
  return typeof single === 'string' && single.trim() ? [single.trim()] : [];
}

/** Solo hace falta listarlos cuando hay más de uno. */
export function hasMultipleAttachments(
  expense: Record<string, unknown> | null | undefined
): boolean {
  return expenseAttachments(expense).length > 1;
}

/**
 * Nombre legible de un adjunto: el del archivo dentro de la URL de storage.
 * Si la URL no lo trae (o no es una URL), se numera para que la lista no
 * quede con filas sin texto.
 */
export function attachmentFileName(url: string, index: number): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    if (name) return name;
  } catch {
    // No es una URL absoluta: se cae al nombre numerado.
  }
  return `Adjunto ${index + 1}`;
}
