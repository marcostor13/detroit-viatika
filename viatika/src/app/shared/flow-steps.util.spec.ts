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

  // VD-112: el paso lleva delante el nivel del aprobador (acá el N2 del centro
  // de costo), para no depender de conocer de memoria quién es de qué nivel.
  it('keeps the cost-center step completed and named after its approver', () => {
    const steps = buildReportFlowSteps(viaticoPendienteDeContabilidad());
    expect(steps[1].label).toBe('N2 · Aprobado por aprobador 2');
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

  // VD-112: en el estado de la rendición los aprobadores salían todos juntos en
  // una sola línea y no se distinguía a qué nivel pertenecía cada uno.
  describe('aprobadores separados por nivel (VD-112)', () => {
    const rendicionCon = (chain: any[]) => ({
      _id: 'r4',
      type: 'rendicion',
      status: 'submitted',
      createdAt: '2026-07-27T00:00:00.000Z',
      expenseIds: [{ _id: 'e1', status: 'pending', approverChain: chain }],
    });

    const approverSteps = (r: any) =>
      buildReportFlowSteps(r).filter(s => /^N\d+ · /.test(s.label));

    it('abre un paso por nivel, en orden N1 y luego N2', () => {
      const steps = approverSteps(
        rendicionCon([
          { level: 1, approved: false, approverIds: [{ _id: 'u1', name: 'Ana' }, { _id: 'u2', name: 'Beto' }] },
          { level: 2, approved: false, approverIds: [{ _id: 'u3', name: 'Carla' }] },
        ])
      );

      expect(steps.map(s => s.label)).toEqual([
        'N1 · Falta aprobación de Ana / Beto',
        'N2 · Falta aprobación de Carla',
      ]);
    });

    // VD-112 (2): dentro de un nivel hay que ver quién firmó y quién no.
    it('separa quién ya aprobó de quién falta dentro del mismo nivel', () => {
      const steps = approverSteps({
        _id: 'r5',
        type: 'rendicion',
        status: 'submitted',
        createdAt: '2026-07-27T00:00:00.000Z',
        expenseIds: [
          {
            _id: 'e1',
            status: 'pending',
            approverChain: [
              {
                level: 1,
                approved: true,
                approvedAt: '2026-07-28T10:00:00.000Z',
                approvedBy: { _id: 'u1', name: 'Ana' },
                approverIds: [{ _id: 'u1', name: 'Ana' }, { _id: 'u2', name: 'Beto' }],
              },
            ],
          },
          {
            _id: 'e2',
            status: 'pending',
            approverChain: [
              {
                level: 1,
                approved: false,
                approverIds: [{ _id: 'u2', name: 'Beto' }],
              },
            ],
          },
        ],
      });

      // Ana firmó el suyo; Beto todavía tiene un comprobante sin aprobar.
      expect(steps[0].label).toBe('N1 · Falta aprobación de Beto');
      expect(steps[0].description).toBe('Ya aprobó: Ana');
      expect(steps[0].state).toBe('active');
    });

    // Con `approvedBy` poblado se nombra a quien realmente hizo el clic, no a
    // todos los candidatos del paso.
    it('nombra a quien aprobó, no a todos los aprobadores posibles del paso', () => {
      const steps = approverSteps({
        _id: 'r6',
        type: 'rendicion',
        status: 'submitted',
        createdAt: '2026-07-27T00:00:00.000Z',
        expenseIds: [{
          _id: 'e1',
          status: 'pending',
          approverChain: [{
            level: 1,
            approved: true,
            approvedAt: '2026-07-28T10:00:00.000Z',
            approvedBy: { _id: 'u1', name: 'Ana' },
            approverIds: [{ _id: 'u1', name: 'Ana' }, { _id: 'u2', name: 'Beto' }],
          }],
        }],
      });

      expect(steps[0].label).toBe('N1 · Aprobado por Ana');
      expect(steps[0].state).toBe('completed');
    });

    it('marca completo solo el nivel que ya aprobó', () => {
      const steps = approverSteps(
        rendicionCon([
          { level: 1, approved: true, approvedAt: '2026-07-28T10:00:00.000Z', approverIds: [{ _id: 'u1', name: 'Ana' }] },
          { level: 2, approved: false, approverIds: [{ _id: 'u3', name: 'Carla' }] },
        ])
      );

      expect(steps[0].label).toBe('N1 · Aprobado por Ana');
      expect(steps[0].state).toBe('completed');
      expect(steps[0].date).toBeTruthy();
      expect(steps[1].label).toBe('N2 · Falta aprobación de Carla');
      expect(steps[1].state).toBe('active');
    });

    // La fase de solicitud del viático también nombra el nivel de cada paso.
    it('nombra el nivel en los pasos de la fase solicitud', () => {
      const steps = buildReportFlowSteps({
        _id: 'v2',
        type: 'viatico',
        status: 'submitted',
        createdAt: '2026-07-27T00:00:00.000Z',
        viaticoPaidAmount: 100,
        viaticoApproverChain: [
          { level: 1, approved: true, approvedAt: '2026-07-27T09:00:00.000Z', approverIds: [{ _id: 'u1', name: 'Ana' }] },
          { level: 2, approved: true, approvedAt: '2026-07-27T11:00:00.000Z', approverIds: [{ _id: 'u2', name: 'Beto' }] },
        ],
        expenseIds: [],
      }).filter(s => s.group === 'solicitud');

      expect(steps[1].label).toBe('N1 · Aprobado por Ana');
      expect(steps[2].label).toBe('N2 · Aprobado por Beto');
    });

    // El viático que ya recibió pago se dibuja con la línea de tiempo de dos
    // fases (solicitud + rendición), que arma sus pasos por separado.
    it('también separa por nivel en la fase rendición de un viático', () => {
      const steps = approverSteps({
        _id: 'v1',
        type: 'viatico',
        status: 'submitted',
        createdAt: '2026-07-27T00:00:00.000Z',
        viaticoPaidAmount: 100,
        expenseIds: [{
          _id: 'e1',
          status: 'pending',
          approverChain: [
            { level: 1, approved: true, approvedAt: '2026-07-28T10:00:00.000Z', approverIds: [{ _id: 'u1', name: 'Ana' }] },
            { level: 2, approved: false, approverIds: [{ _id: 'u3', name: 'Carla' }] },
          ],
        }],
      });

      expect(steps.map(s => s.label)).toEqual([
        'N1 · Aprobado por Ana',
        'N2 · Falta aprobación de Carla',
      ]);
    });

    // Un mismo aprobador puede ser N1 de un centro de costo y N2 de otro: antes
    // se colapsaba al nivel menor y su paso de N2 desaparecía de la vista.
    it('muestra al aprobador que actúa en dos niveles en ambos', () => {
      const steps = approverSteps(
        rendicionCon([
          { level: 1, approved: true, approvedAt: '2026-07-28T10:00:00.000Z', approverIds: [{ _id: 'u1', name: 'Ana' }] },
          { level: 2, approved: false, approverIds: [{ _id: 'u1', name: 'Ana' }] },
        ])
      );

      expect(steps.map(s => s.label)).toEqual([
        'N1 · Aprobado por Ana',
        'N2 · Falta aprobación de Ana',
      ]);
    });
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

  it('sigue siendo solicitud la de caja chica ya depositada: no se rinde sobre ese documento', () => {
    expect(
      isSolicitudPhase({
        type: 'viatico',
        isSolicitudCajaChica: true,
        status: 'paid',
        viaticoPaidAmount: 3000,
      })
    ).toBeTrue();
  });
});
