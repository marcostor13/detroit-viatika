import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { InicioComponent } from './inicio.component';
import { UserStateService } from '../../services/user-state.service';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { AdvanceService } from '../../services/advance.service';
import { NotificationService } from '../../services/notification.service';
import { IExpenseReport } from '../../interfaces/expense-report.interface';

/**
 * "Rendiciones por aprobar" del Inicio. Con el modelo por comprobante (regla
 * 1.4, VD-87) la rendición se aprueba aprobando todos sus gastos, así que la
 * lista se arma por comprobantes pendientes de ESTE aprobador y no por el
 * estado del reporte.
 */
describe('InicioComponent — rendiciones por aprobar', () => {
  const ME = 'u-aprobador';
  let component: InicioComponent;
  let userState: jasmine.SpyObj<UserStateService>;

  /** Comprobante con un paso de cadena para `approverId`, aprobado o no. */
  const expense = (approverId: string, approved: boolean, extra: Record<string, unknown> = {}) => ({
    _id: 'e' + approverId + approved,
    total: 100,
    status: 'pending',
    approverChain: [{ level: 1, approved, approverIds: [{ _id: approverId, name: 'x' }] }],
    ...extra,
  });

  const report = (over: Partial<IExpenseReport> = {}): IExpenseReport =>
    ({
      _id: 'r1',
      title: 'Rendición',
      type: 'rendicion',
      status: 'open',
      budget: 0,
      userId: { _id: 'u-colab', name: 'Colaborador' },
      expenseIds: [],
      createdAt: '2026-07-27T00:00:00.000Z',
      ...over,
    }) as unknown as IExpenseReport;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', [
      'getUser', 'isSuperAdmin', 'isColaborador', 'isCoordinador', 'isContabilidad',
      'isTesoreria', 'hasModulePermission', 'canAccessTesoreria', 'refreshApproverStatus',
      'getRole', 'isAnyAdmin',
    ]);
    userState.getUser.and.returnValue({ _id: ME, clientId: 'c1' } as any);
    userState.isSuperAdmin.and.returnValue(false);
    userState.hasModulePermission.and.returnValue(false);

    TestBed.configureTestingModule({
      imports: [InicioComponent],
      providers: [
        { provide: UserStateService, useValue: userState },
        { provide: ExpenseReportsService, useValue: jasmine.createSpyObj('ExpenseReportsService', ['findAllByClient', 'approveViatico', 'findPendingReimbursements']) },
        { provide: AdvanceService, useValue: jasmine.createSpyObj('AdvanceService', ['findOrphaned', 'approve']) },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['show']) },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
      ],
    });
    component = TestBed.createComponent(InicioComponent).componentInstance;
  });

  it('lists a directa with a comprobante awaiting my signature', () => {
    component.teamReports.set([
      report({ isDirecta: true, expenseIds: [expense(ME, false)] } as any),
    ]);
    expect(component.rendicionesRows().length).toBe(1);
    expect(component.kpiRendicionesPorAprobar()).toBe(1);
  });

  it('does not list it once I approved all of my steps', () => {
    component.teamReports.set([
      report({ isDirecta: true, expenseIds: [expense(ME, true)] } as any),
    ]);
    expect(component.rendicionesRows().length).toBe(0);
  });

  it('does not list a rendicion whose pending comprobante belongs to another approver', () => {
    component.teamReports.set([
      report({ expenseIds: [expense('otro-aprobador', false)] } as any),
    ]);
    expect(component.rendicionesRows().length).toBe(0);
  });

  it('ignores rejected comprobantes', () => {
    component.teamReports.set([
      report({ expenseIds: [expense(ME, false, { status: 'rejected' })] } as any),
    ]);
    expect(component.rendicionesRows().length).toBe(0);
  });

  it('lists it while it is still open — the chain exists from the first comprobante', () => {
    component.teamReports.set([
      report({ status: 'open', expenseIds: [expense(ME, false)] } as any),
    ]);
    expect(component.rendicionesRows().length).toBe(1);
  });

  // Modelo anterior: viáticos ya enviados sin cadena por comprobante, que se
  // aprueban con el botón de respaldo a nivel de reporte.
  it('still lists a submitted viatico with no per-expense chain', () => {
    component.teamReports.set([
      report({ type: 'viatico', status: 'submitted', expenseIds: [] } as any),
    ]);
    expect(component.rendicionesRows().length).toBe(1);
  });

  it('shows the directa amount as the sum of its comprobantes, not its budget', () => {
    component.teamReports.set([
      report({
        isDirecta: true,
        budget: 0,
        expenseIds: [expense(ME, false), { _id: 'e2', total: 45, approverChain: [] }],
      } as any),
    ]);
    expect(component.rendicionesRows()[0].amount).toBe(145);
  });
});
