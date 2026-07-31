import { buildReportFlowSteps, isSolicitudPhase } from './flow-steps.util';

describe('buildReportFlowSteps', () => {
  // Al completarse el paso pasa a "Aprobado por <nombre real>", así que se busca
  // sin distinguir mayúsculas.
  const contaStep = (r: any) =>
    buildReportFlowSteps(r).find(s => /contabilidad/i.test(s.label))!;

  /**
   * Centro de costo con un solo aprobador, y que es el N2 ("aprobador 2"): la
   * cadena tiene 1 paso pero su `level` es 2. Contabilidad todavía no aprobó
   * —el viático está en `pending_contabilidad`, esperándola—.
   */
  const viaticoPendienteDeContabilidad = () => ({
    _id: 'r1',
    type: 'viatico',
    status: 'pending_contabilidad',
    createdAt: '2026-07-27T00:00:00.000Z',
    viaticoRequiredLevels: 1,
    viaticoApprovalLevel: 1,
    viaticoApproverChain: [
      {
        level: 2,
        approved: true,
        approvedAt: '2026-07-27T00:00:00.000Z',
        approverIds: [{ _id: 'u2', name: 'aprobador 2' }],
      },
    ],
    viaticoApprovalHistory: [
      { level: 2, action: 'approved', approvedBy: 'aprobador 2', date: '2026-07-27T00:00:00.000Z' },
    ],
  });

  it('does not mark Contabilidad as done while the viatico is pending_contabilidad', () => {
    const step = contaStep(viaticoPendienteDeContabilidad());
    expect(step.state).toBe('active');
    expect(step.label).toBe('Aprobación de Contabilidad');
  });

  it('marks Contabilidad as done once it actually approved the solicitud', () => {
    const step = contaStep({
      ...viaticoPendienteDeContabilidad(),
      status: 'viatico_approved',
      viaticoSolicitudContabilidadApprovedAt: '2026-07-27T10:00:00.000Z',
      viaticoSolicitudContabilidadApprovedBy: { _id: 'u5', name: 'contabilidad' },
      viaticoApprovalHistory: [
        { level: 2, action: 'approved', approvedBy: 'aprobador 2', date: '2026-07-27T00:00:00.000Z' },
        { level: 2, action: 'approved', approvedBy: 'contabilidad', date: '2026-07-27T10:00:00.000Z' },
      ],
    });
    expect(step.state).toBe('completed');
    expect(step.label).toBe('Aprobado por contabilidad');
  });

  it('keeps the cost-center step completed and named after its approver', () => {
    const steps = buildReportFlowSteps(viaticoPendienteDeContabilidad());
    expect(steps[1].label).toBe('Aprobado por aprobador 2');
    expect(steps[1].state).toBe('completed');
  });

  // Una rendición normal sí registra su aprobación en `contabilidadApprovedAt`.
  it('marks Contabilidad as done for a rendicion approved through its own field', () => {
    const step = contaStep({
      _id: 'r2',
      type: 'rendicion',
      status: 'approved',
      createdAt: '2026-07-27T00:00:00.000Z',
      contabilidadApprovedAt: '2026-07-27T10:00:00.000Z',
      contabilidadApprovedBy: { _id: 'u5', name: 'contabilidad' },
    });
    expect(step.state).toBe('completed');
  });

  it('leaves Contabilidad pending for a rendicion still in pending_accounting', () => {
    const step = contaStep({
      _id: 'r3',
      type: 'rendicion',
      status: 'pending_accounting',
      createdAt: '2026-07-27T00:00:00.000Z',
    });
    expect(step.state).toBe('active');
  });
});

describe('isSolicitudPhase', () => {
  it('is true for a viatico that has not been paid yet', () => {
    expect(isSolicitudPhase({ type: 'viatico', status: 'viatico_approved', viaticoPaidAmount: 0 })).toBeTrue();
  });

  it('is false once the viatico received a payment', () => {
    expect(isSolicitudPhase({ type: 'viatico', status: 'viatico_approved', viaticoPaidAmount: 30 })).toBeFalse();
  });

  it('is false for a viatico registering gastos', () => {
    expect(isSolicitudPhase({ type: 'viatico', status: 'open' })).toBeFalse();
  });

  it('is true for a rendicion still solicited and false once open', () => {
    expect(isSolicitudPhase({ type: 'rendicion', status: 'solicited' })).toBeTrue();
    expect(isSolicitudPhase({ type: 'rendicion', status: 'open' })).toBeFalse();
  });

  it('is false for a directa, which is born in the rendicion phase', () => {
    expect(isSolicitudPhase({ type: 'directa', isDirecta: true, status: 'open' })).toBeFalse();
  });
});
