import {
  attachmentFileName,
  expenseAttachments,
  hasMultipleAttachments,
} from './adjuntos.util';

/**
 * La planilla de movilidad y Otros Gastos admiten varios documentos de
 * respaldo; el resto de tipos, y todo lo cargado antes de esa opción, trae
 * solo `file`. Estas funciones son las que unifican las dos formas.
 */
describe('adjuntos.util', () => {
  describe('expenseAttachments', () => {
    it('devuelve la lista completa cuando el comprobante trae varios', () => {
      expect(
        expenseAttachments({
          file: 'http://s3/uno.pdf',
          attachments: ['http://s3/uno.pdf', 'http://s3/dos.jpg'],
        })
      ).toEqual(['http://s3/uno.pdf', 'http://s3/dos.jpg']);
    });

    it('cae en `file` para los comprobantes de un solo adjunto', () => {
      expect(expenseAttachments({ file: 'http://s3/uno.pdf' })).toEqual([
        'http://s3/uno.pdf',
      ]);
    });

    it('sin adjunto devuelve la lista vacía', () => {
      expect(expenseAttachments({})).toEqual([]);
      expect(expenseAttachments(null)).toEqual([]);
      expect(expenseAttachments({ file: '   ' })).toEqual([]);
    });

    it('descarta entradas vacías o que no son texto', () => {
      expect(
        expenseAttachments({
          attachments: ['http://s3/uno.pdf', '  ', null, 7],
        } as any)
      ).toEqual(['http://s3/uno.pdf']);
    });

    it('recorta los espacios de las URLs', () => {
      expect(expenseAttachments({ file: ' http://s3/uno.pdf ' })).toEqual([
        'http://s3/uno.pdf',
      ]);
    });
  });

  describe('hasMultipleAttachments', () => {
    it('es true solo con más de uno', () => {
      expect(hasMultipleAttachments({ file: 'http://s3/uno.pdf' })).toBeFalse();
      expect(
        hasMultipleAttachments({
          attachments: ['http://s3/uno.pdf', 'http://s3/dos.jpg'],
        })
      ).toBeTrue();
      expect(hasMultipleAttachments({})).toBeFalse();
    });
  });

  describe('attachmentFileName', () => {
    it('usa el nombre del archivo dentro de la URL', () => {
      expect(attachmentFileName('http://s3/bucket/boleta%20taxi.pdf', 0)).toBe(
        'boleta taxi.pdf'
      );
    });

    // Sin nombre legible la fila quedaría vacía: se numera.
    it('numera cuando la URL no trae nombre', () => {
      expect(attachmentFileName('no-es-una-url', 1)).toBe('Adjunto 2');
      expect(attachmentFileName('http://s3/', 0)).toBe('Adjunto 1');
    });
  });
});
