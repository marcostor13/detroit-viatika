import { chainLevelLabels, chainStepStage } from './approval-level-label.util';

describe('chainLevelLabels', () => {
  it('deja el nivel a secas cuando aparece una sola vez', () => {
    expect(chainLevelLabels([1, 2])).toEqual(['N1', 'N2']);
  });

  // Cadena de una rendición hacia un centro de costo ajeno: N1 → N2 del centro
  // principal → N2 del centro seleccionado.
  it('sub-numera los pasos de un nivel repetido, en orden de cadena', () => {
    expect(chainLevelLabels([1, 2, 2])).toEqual(['N1', 'N2-1', 'N2-2']);
  });

  // Solicitud de fondos hacia otro centro de costo: los dos pasos son N2.
  it('sub-numera aunque el nivel repetido sea el único de la cadena', () => {
    expect(chainLevelLabels([2, 2])).toEqual(['N2-1', 'N2-2']);
  });

  it('numera cada nivel repetido por separado', () => {
    expect(chainLevelLabels([1, 1, 2, 2, 3])).toEqual(['N1-1', 'N1-2', 'N2-1', 'N2-2', 'N3']);
  });

  it('devuelve una lista vacía para una cadena vacía', () => {
    expect(chainLevelLabels([])).toEqual([]);
  });
});

describe('chainStepStage', () => {
  it('reconoce el paso del centro de costo seleccionado', () => {
    expect(chainStepStage({ projectRole: 'seleccionado' })).toBe('seleccionado');
  });

  it('trata como del principal el paso sin projectRole (cadenas anteriores)', () => {
    expect(chainStepStage({})).toBe('principal');
    expect(chainStepStage(undefined)).toBe('principal');
  });
});
