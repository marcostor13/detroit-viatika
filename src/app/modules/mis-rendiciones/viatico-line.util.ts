/**
 * Total por línea según regla de negocio del cliente:
 * - Si GLP/día > 0: Importe × GLP/día × Días
 * - Si no: Importe × Personas × Días
 */
export function computeViaticoLineTotal(
  importe: number,
  glpPerDay: number,
  days: number,
  peopleCount: number
): number {
  const imp = Number(importe) || 0;
  const glp = Number(glpPerDay) || 0;
  const d = Number(days) || 0;
  const p = Number(peopleCount) || 0;
  const raw = glp > 0 ? imp * glp * d : imp * p * d;
  return Math.round(raw * 100) / 100;
}

/** Normaliza valores de inputs type="number" (null, '', etc.) antes de validar/enviar. */
export function coerceViaticoLineNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Mantiene vacío en el formulario; convierte solo si el usuario ingresó un valor. */
export function optionalViaticoLineNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * GLP/día y Personas son mutuamente opcionales según la fórmula:
 * con GLP > 0 no hace falta Personas; sin GLP, Personas es obligatorio.
 */
export function validateViaticoLineFields(v: {
  importe: unknown;
  peopleCount: unknown;
  glpPerDay: unknown;
  days: unknown;
}): string | null {
  const imp = coerceViaticoLineNumber(v.importe);
  const glp = coerceViaticoLineNumber(v.glpPerDay);
  const people = coerceViaticoLineNumber(v.peopleCount);
  const days = coerceViaticoLineNumber(v.days);

  if (imp <= 0) {
    return 'Indique el importe en cada fila del detalle.';
  }
  if (days <= 0) {
    return 'Indique los días en cada fila del detalle.';
  }
  if (glp > 0 || people > 0) {
    return null;
  }
  return 'En cada fila complete GLP/día o Personas (según la categoría; uno de los dos).';
}
