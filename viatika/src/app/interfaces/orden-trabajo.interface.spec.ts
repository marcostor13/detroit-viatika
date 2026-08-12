import {
  IOrdenTrabajo,
  otCentroCostoIds,
  otCentroCostoLabel,
  otCentroCostoLabels,
  otPerteneceACentroCosto,
} from './orden-trabajo.interface';

describe('helpers de centros de costo de una OT', () => {
  const cc123 = { _id: 'cc123', code: '123', name: 'LIMA - SERVICIO MINERIA' };
  const cc223 = { _id: 'cc223', code: '223', name: 'ANTAMINA - SERVICIO MINERIA' };

  it('junta el principal con la lista, sin repetirlo', () => {
    const ot: IOrdenTrabajo = {
      nombre: 'LIM-SMI-1',
      costCenterId: cc123,
      costCenterIds: [cc123, cc223],
    };
    expect(otCentroCostoIds(ot)).toEqual(['cc123', 'cc223']);
  });

  // Las OT creadas antes del cambio no traen la lista.
  it('cae al centro de costo principal cuando no hay lista', () => {
    const ot: IOrdenTrabajo = { nombre: 'Lim-Com-1', costCenterId: cc123 };
    expect(otCentroCostoIds(ot)).toEqual(['cc123']);
  });

  it('soporta ids planos, no solo el ref poblado', () => {
    const ot: IOrdenTrabajo = {
      nombre: 'Lim-Com-1',
      costCenterId: 'cc123',
      costCenterIds: ['cc123', 'cc223'],
    };
    expect(otCentroCostoIds(ot)).toEqual(['cc123', 'cc223']);
  });

  it('antepone el principal aunque no esté en la lista', () => {
    const ot: IOrdenTrabajo = {
      nombre: 'LIM-SMI-1',
      costCenterId: cc123,
      costCenterIds: [cc223],
    };
    expect(otCentroCostoIds(ot)).toEqual(['cc123', 'cc223']);
  });

  it('la OT pertenece a cualquiera de sus centros de costo', () => {
    const ot: IOrdenTrabajo = {
      nombre: 'LIM-SMI-1',
      costCenterId: cc123,
      costCenterIds: [cc123, cc223],
    };
    expect(otPerteneceACentroCosto(ot, 'cc123')).toBeTrue();
    expect(otPerteneceACentroCosto(ot, 'cc223')).toBeTrue();
    expect(otPerteneceACentroCosto(ot, 'otro')).toBeFalse();
    expect(otPerteneceACentroCosto(ot, '')).toBeFalse();
  });

  it('etiqueta el principal y lista todas sin repetir', () => {
    const ot: IOrdenTrabajo = {
      nombre: 'LIM-SMI-1',
      costCenterId: cc123,
      costCenterIds: [cc123, cc223],
    };
    expect(otCentroCostoLabel(ot)).toBe('123 — LIMA - SERVICIO MINERIA');
    expect(otCentroCostoLabels(ot)).toEqual([
      '123 — LIMA - SERVICIO MINERIA',
      '223 — ANTAMINA - SERVICIO MINERIA',
    ]);
  });

  it('sin ref poblado no inventa etiquetas', () => {
    const ot: IOrdenTrabajo = { nombre: 'Lim-Com-1', costCenterId: 'cc123' };
    expect(otCentroCostoLabel(ot)).toBe('');
    expect(otCentroCostoLabels(ot)).toEqual([]);
  });
});
