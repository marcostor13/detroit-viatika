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

describe('rendición de caja chica', () => {
  const labels = (r: any) => buildReportFlowSteps(r).map(s => s.label);

  /**
   * Rendición de caja chica ya aprobada por sus dos niveles y por Contabilidad.
   * Su `settlement` todavía no existe: el backend recién lo persiste cuando
   * Tesorería registra el depósito (ver `findPendingReimbursements`).
   */
  const cajaChicaAprobada = () => ({
    _id: 'cc1',
    isCajaChica: true,
    status: 'approved',
    createdAt: '2026-08-01T00:00:00.000Z',
    contabilidadApprovedAt: '2026-08-05T00:00:00.000Z',
    contabilidadApprovedBy: { _id: 'u9', name: 'Contabilidad' },
    expenseIds: [
      {
        status: 'approved',
        approverChain: [
          { level: 1, approved: true, approvedAt: '2026-08-03T00:00:00.000Z', approverIds: [{ _id: 'u1', name: 'Ana' }] },
        ],
      },
    ],
  });

  /** La misma rendición cuando todavía está esperando a su primer aprobador. */
  const cajaChicaEnAprobacion = () => ({
    _id: 'cc1',
    isCajaChica: true,
    status: 'submitted',
    createdAt: '2026-08-18T00:00:00.000Z',
    expenseIds: [
      {
        status: 'submitted',
        approverChain: [
          { level: 1, approved: false, approverIds: [{ _id: 'u1', name: 'Ana' }] },
        ],
      },
    ],
  });

  it('anuncia el reembolso y el cierre desde que la rendición está en aprobación', () => {
    // El desenlace se conoce al abrirla: lo rendido sale del fondo del
    // responsable, así que el saldo queda a su favor y lo repone Tesorería.
    // Antes la línea de tiempo terminaba en "Finalizada" y no decía que
    // después de Contabilidad todavía venían dos pasos.
    const steps = buildReportFlowSteps(cajaChicaEnAprobacion());

    expect(steps.map(s => s.label)).toContain('Reembolso de Tesorería');
    expect(steps.map(s => s.label)).toContain('Cierre de Tesorería');
    expect(steps.map(s => s.label)).not.toContain('Finalizada');
  });

  it('no adelanta el paso activo a Tesorería mientras faltan aprobaciones', () => {
    const steps = buildReportFlowSteps(cajaChicaEnAprobacion());
    const activos = steps.filter(s => s.state === 'active').map(s => s.label);

    expect(activos).toEqual(['N1 · Falta aprobación de Ana']);
    expect(steps.find(s => s.label === 'Reembolso de Tesorería')!.state).toBe('upcoming');
    expect(steps.find(s => s.label === 'Cierre de Tesorería')!.state).toBe('upcoming');
  });

  it('tras la aprobación de Contabilidad espera la reposición y el cierre de Tesorería', () => {
    const steps = buildReportFlowSteps(cajaChicaAprobada());

    expect(steps.map(s => s.label)).toContain('Reembolso de Tesorería');
    expect(steps.find(s => s.label === 'Reembolso de Tesorería')!.state).toBe('active');
    expect(steps.map(s => s.label)).toContain('Cierre de Tesorería');
    // El paso genérico "Aprobada" ya no cierra la línea: quedaba como estado
    // final y ocultaba que Tesorería todavía tenía que depositar.
    expect(steps.map(s => s.label)).not.toContain('Aprobada');
  });

  it('marca la reposición hecha y deja pendiente el cierre cuando Tesorería depositó', () => {
    const steps = buildReportFlowSteps({
      ...cajaChicaAprobada(),
      status: 'reimbursed',
      reimbursedAt: '2026-08-07T00:00:00.000Z',
      reimbursementPaymentInfo: { transferDate: '2026-08-07' },
      settlement: { type: 'reembolso', difference: -300 },
    });

    expect(steps.find(s => s.label === 'Reembolsado por Tesorería')!.state).toBe('completed');
    expect(steps.find(s => s.label === 'Cierre de Tesorería')!.state).toBe('active');
  });

  it('usa el camino de la devolución cuando el saldo va a favor de la empresa', () => {
    const steps = labels({
      ...cajaChicaAprobada(),
      settlement: { type: 'devolucion', difference: 120 },
    });

    expect(steps).toContain('Devolución del colaborador');
    expect(steps).toContain('Cierre de Tesorería');
    expect(steps).not.toContain('Reembolso de Tesorería');
  });

  it('no cambia la rendición normal, que sí termina en "Aprobada"', () => {
    const steps = labels({ ...cajaChicaAprobada(), isCajaChica: false });

    expect(steps).toContain('Aprobada');
    expect(steps).not.toContain('Reembolso de Tesorería');
  });
});

describe('rendición directa del colaborador', () => {
  const labels = (r: any) => buildReportFlowSteps(r).map(s => s.label);
  const paso = (r: any, label: string) => buildReportFlowSteps(r).find(s => s.label === label);

  /**
   * Directa SIN depósito: todo lo rendido salió del bolsillo del colaborador,
   * así que el saldo siempre queda a su favor y lo paga Tesorería. Se anuncia
   * desde que está en trámite, igual que la caja chica: esperar al estado
   * terminal escondía el paso justo cuando sirve saberlo.
   */
  const directaEnAprobacion = () => ({
    _id: 'rd1',
    isDirecta: true,
    status: 'submitted',
    createdAt: '2026-08-19T00:00:00.000Z',
    expenseIds: [
      {
        status: 'submitted',
        approverChain: [
          { level: 1, approved: true, approvedAt: '2026-08-19T00:00:00.000Z', approverIds: [{ _id: 'u1', name: 'Ivan' }] },
        ],
      },
    ],
  });

  it('anuncia el pago de Tesorería mientras la rendición está en trámite', () => {
    const l = labels(directaEnAprobacion());
    expect(l).toContain('Reembolso de Tesorería');
    expect(l.indexOf('Reembolso de Tesorería')).toBeGreaterThan(l.indexOf('Aprobación de Contabilidad'));
  });

  it('lo marca pendiente, no completado', () => {
    // Sin descripción: como el resto de la cronología, el detalle de "qué falta"
    // solo se escribe en el paso que está activo ahora mismo.
    expect(paso(directaEnAprobacion(), 'Reembolso de Tesorería')?.state).toBe('upcoming');
  });

  it('lo pinta activo y explica qué falta una vez que Contabilidad aprobó', () => {
    const r: any = { ...directaEnAprobacion(), status: 'approved', contabilidadApprovedAt: '2026-08-20T00:00:00.000Z' };
    const p = paso(r, 'Reembolso de Tesorería');
    expect(p?.state).toBe('active');
    expect(p?.description).toContain('Pendiente de pago de Tesorería');
  });

  it('lo da por hecho cuando Tesorería ya pagó', () => {
    const r: any = { ...directaEnAprobacion(), status: 'reimbursed', contabilidadApprovedAt: '2026-08-20T00:00:00.000Z' };
    expect(paso(r, 'Reembolsado por Tesorería')?.state).toBe('completed');
  });

  it('una directa CON depósito no lo anuncia: su desenlace no se sabe hasta liquidar', () => {
    // Puede terminar en reembolso, en devolución o equilibrada.
    const r: any = { ...directaEnAprobacion(), directaDeposit: { amount: 500 } };
    expect(labels(r)).not.toContain('Reembolso de Tesorería');
  });

  it('una directa que terminó en devolución sigue el otro camino', () => {
    const r: any = { ...directaEnAprobacion(), status: 'returned', settlement: { type: 'devolucion' } };
    expect(labels(r)).not.toContain('Reembolso de Tesorería');
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
