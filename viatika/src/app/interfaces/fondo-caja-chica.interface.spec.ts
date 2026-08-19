import {
  cajaChicaEsperaDevolucion,
  rendicionCajaChicaStatusLabel,
} from './fondo-caja-chica.interface';

/**
 * Después de que Contabilidad aprueba, la rendición de caja chica todavía tiene
 * dos pasos: el reembolso (lo deposita Tesorería, o lo devuelve el colaborador
 * si el saldo quedó a favor de la empresa) y el cierre definitivo de Tesorería.
 * El `status` solo no los distingue —la devolución no lo cambia, únicamente
 * escribe `returnVoucher`—, así que la etiqueta los lee de todo el documento.
 */
describe('rendicionCajaChicaStatusLabel', () => {
  it('avisa que falta el reembolso de Tesorería cuando Contabilidad ya aprobó', () => {
    expect(rendicionCajaChicaStatusLabel({ status: 'approved' })).toBe(
      'Aprobada, por reembolsar Tesorería'
    );
  });

  it('avisa que le toca devolver al colaborador cuando el saldo va a la empresa', () => {
    expect(
      rendicionCajaChicaStatusLabel({
        status: 'approved',
        settlement: { type: 'devolucion', difference: 120 },
      })
    ).toBe('Aprobada, por devolver el colaborador');
  });

  it('pasa a "por cerrar Tesorería" apenas el colaborador carga su devolución', () => {
    // La devolución no mueve el `status`: sigue en `approved` y solo aparece el
    // comprobante. Sin mirarlo, la rendición se quedaba en "Aprobada".
    expect(
      rendicionCajaChicaStatusLabel({
        status: 'approved',
        settlement: { type: 'devolucion', difference: 120 },
        returnVoucher: { url: 'https://x/y.pdf' },
      })
    ).toBe('Devuelta, por cerrar Tesorería');
  });

  it('pasa a "por cerrar Tesorería" cuando Tesorería ya reembolsó', () => {
    expect(rendicionCajaChicaStatusLabel({ status: 'reimbursed' })).toBe(
      'Reembolsada, por cerrar Tesorería'
    );
  });

  it('solo da la rendición por terminada cuando Tesorería la cierra', () => {
    expect(rendicionCajaChicaStatusLabel({ status: 'closed' })).toBe(
      'Cerrada por Tesorería'
    );
  });

  it('mantiene los estados previos a la aprobación', () => {
    expect(rendicionCajaChicaStatusLabel({ status: 'open' })).toBe('Registrando gastos');
    expect(rendicionCajaChicaStatusLabel({ status: 'submitted' })).toBe('Pendiente de aprobación');
    expect(rendicionCajaChicaStatusLabel({ status: 'pending_accounting' })).toBe('En Contabilidad');
    expect(rendicionCajaChicaStatusLabel({ status: 'rejected' })).toBe('Observada');
  });
});

describe('cajaChicaEsperaDevolucion', () => {
  it('es falso sin liquidación: en caja chica lo rendido se le reembolsa al responsable', () => {
    expect(cajaChicaEsperaDevolucion({ status: 'approved' } as any)).toBeFalse();
  });

  it('usa el tipo de liquidación cuando ya está calculada', () => {
    expect(cajaChicaEsperaDevolucion({ settlement: { type: 'devolucion' } })).toBeTrue();
    expect(cajaChicaEsperaDevolucion({ settlement: { type: 'reembolso' } })).toBeFalse();
  });

  it('cae en el signo de la diferencia mientras no haya tipo', () => {
    expect(cajaChicaEsperaDevolucion({ settlement: { difference: 120 } })).toBeTrue();
    expect(cajaChicaEsperaDevolucion({ settlement: { difference: -120 } })).toBeFalse();
  });
});
