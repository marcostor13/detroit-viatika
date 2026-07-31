import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ViaticosDetailComponent } from './viaticos-detail.component';
import { AdvanceService } from '../../../services/advance.service';
import { UserStateService } from '../../../services/user-state.service';
import { NotificationService } from '../../../services/notification.service';
import { IAdvance } from '../../../interfaces/advance.interface';

describe('ViaticosDetailComponent', () => {
  let component: ViaticosDetailComponent;
  let advanceService: jasmine.SpyObj<AdvanceService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let router: jasmine.SpyObj<Router>;

  const baseAdvance: IAdvance = {
    _id: 'adv-1',
    userId: { _id: 'user-1', name: 'Juan Perez', email: 'juan@test.com' },
    clientId: 'client-1',
    approverChain: [
      { _id: 'appr-1', name: 'Ana Aprobadora', email: 'ana@test.com' },
      { _id: 'appr-2', name: 'Beto Aprobador', email: 'beto@test.com' },
    ],
    projectId: { _id: 'proj-1', code: 'PRJ1', name: 'Proyecto Uno' },
    place: 'Lima',
    startDate: '2026-01-01',
    endDate: '2026-01-05',
    lines: [
      { categoryId: { _id: 'cat-1', name: 'Alimentacion' }, detalle: 'Almuerzos', importe: 50, peopleCount: 2, glpPerDay: 0, days: 3, lineTotal: 300 },
    ],
    amount: 300,
    description: 'Viaje a Lima',
    status: 'pending_l1',
    approvalLevel: 0,
    requiredLevels: 2,
    approvalHistory: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  function setup(id = 'adv-1') {
    const activatedRoute = {
      snapshot: { paramMap: convertToParamMap({ id }) },
    };

    TestBed.configureTestingModule({
      imports: [ViaticosDetailComponent],
      providers: [
        { provide: AdvanceService, useValue: advanceService },
        { provide: UserStateService, useValue: userState },
        { provide: NotificationService, useValue: notifications },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: activatedRoute },
      ],
    });
    const fixture = TestBed.createComponent(ViaticosDetailComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    advanceService = jasmine.createSpyObj('AdvanceService', ['findOne', 'approve', 'reject', 'cancelAdvance']);
    userState = jasmine.createSpyObj('UserStateService', ['getUser', 'isSuperAdmin']);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    advanceService.findOne.and.returnValue(of(baseAdvance));
    userState.getUser.and.returnValue({ _id: 'appr-1' } as any);
    userState.isSuperAdmin.and.returnValue(false);
  });

  describe('ngOnInit', () => {
    beforeEach(() => setup());

    it('loads the advance by route id and clears isLoading', () => {
      component.ngOnInit();
      expect(advanceService.findOne).toHaveBeenCalledWith('adv-1');
      expect(component.advance()).toEqual(baseAdvance);
      expect(component.isLoading()).toBeFalse();
    });

    it('builds rejectForm with required + minLength(10) validators', () => {
      component.ngOnInit();
      const control = component.rejectForm.get('rejectionReason')!;
      control.setValue('');
      expect(control.valid).toBeFalse();
      control.setValue('short');
      expect(control.valid).toBeFalse();
      control.setValue('a valid long reason');
      expect(control.valid).toBeTrue();
    });

    it('navigates to /rendiciones and shows an error notification when load fails', () => {
      advanceService.findOne.and.returnValue(throwError(() => new Error('not found')));
      component.ngOnInit();
      expect(notifications.show).toHaveBeenCalledWith('No se pudo cargar la solicitud', 'error');
      expect(router.navigate).toHaveBeenCalledWith(['/rendiciones']);
    });
  });

  describe('back()', () => {
    beforeEach(() => setup());
    it('navigates to /rendiciones', () => {
      component.back();
      expect(router.navigate).toHaveBeenCalledWith(['/rendiciones']);
    });
  });

  describe('canApproveAction / canRejectAction (L1 vs L2 permission logic)', () => {
    beforeEach(() => setup());

    it('is false when there is no advance loaded', () => {
      expect(component.canApproveAction).toBeFalse();
      expect(component.canRejectAction).toBeFalse();
    });

    it('is false when the advance is not pending_l1', () => {
      component.ngOnInit();
      component.advance.set({ ...baseAdvance, status: 'approved' });
      expect(component.canApproveAction).toBeFalse();
    });

    it('is true for the expected approver at the current approval level', () => {
      userState.getUser.and.returnValue({ _id: 'appr-1' } as any);
      component.ngOnInit();
      expect(component.canApproveAction).toBeTrue();
      expect(component.canRejectAction).toBeTrue();
    });

    it('is false for a user who is not the expected approver at this level', () => {
      userState.getUser.and.returnValue({ _id: 'someone-else' } as any);
      component.ngOnInit();
      expect(component.canApproveAction).toBeFalse();
    });

    it('is true for the second-level approver once approvalLevel advances (2-level / L2 chain)', () => {
      userState.getUser.and.returnValue({ _id: 'appr-2' } as any);
      component.ngOnInit();
      component.advance.set({ ...baseAdvance, approvalLevel: 1 });
      expect(component.canApproveAction).toBeTrue();
    });

    it('is true for any pending_l1 advance when the user is SuperAdmin regardless of chain position', () => {
      userState.getUser.and.returnValue({ _id: 'irrelevant' } as any);
      userState.isSuperAdmin.and.returnValue(true);
      component.ngOnInit();
      expect(component.canApproveAction).toBeTrue();
    });

    it('single-level advance (<= S/500 threshold, requiredLevels=1) is approvable by the sole approver', () => {
      const singleLevel: IAdvance = {
        ...baseAdvance,
        amount: 300,
        requiredLevels: 1,
        approverChain: [{ _id: 'appr-1', name: 'Ana Aprobadora', email: 'ana@test.com' }],
      };
      advanceService.findOne.and.returnValue(of(singleLevel));
      userState.getUser.and.returnValue({ _id: 'appr-1' } as any);
      component.ngOnInit();
      expect(component.canApproveAction).toBeTrue();
    });
  });

  describe('canCancelAction', () => {
    beforeEach(() => setup());

    it('is true when the advance is pending_l1 and belongs to the current user', () => {
      userState.getUser.and.returnValue({ _id: 'user-1' } as any);
      component.ngOnInit();
      expect(component.canCancelAction).toBeTrue();
    });

    it('is false when the advance does not belong to the current user', () => {
      userState.getUser.and.returnValue({ _id: 'other-user' } as any);
      component.ngOnInit();
      expect(component.canCancelAction).toBeFalse();
    });

    it('is false when the advance is not pending_l1', () => {
      userState.getUser.and.returnValue({ _id: 'user-1' } as any);
      component.ngOnInit();
      component.advance.set({ ...baseAdvance, status: 'approved' });
      expect(component.canCancelAction).toBeFalse();
    });
  });

  describe('approve()', () => {
    beforeEach(() => {
      setup();
      component.ngOnInit();
    });

    it('does nothing when there is no advance loaded', () => {
      component.advance.set(null);
      component.approve();
      expect(advanceService.approve).not.toHaveBeenCalled();
    });

    it('calls advanceService.approve, updates advance and shows level progress message', () => {
      const updated: IAdvance = { ...baseAdvance, approvalLevel: 1, status: 'pending_l1' };
      advanceService.approve.and.returnValue(of(updated));
      component.approve();

      expect(advanceService.approve).toHaveBeenCalledWith('adv-1', {});
      expect(component.advance()).toEqual(updated);
      expect(notifications.show).toHaveBeenCalledWith('Solicitud aprobada (nivel 1 de 2)', 'success');
      expect(component.isActing()).toBeFalse();
    });

    it('shows backend error message and resets isActing on failure', () => {
      advanceService.approve.and.returnValue(throwError(() => ({ error: { message: 'No es tu turno de aprobar' } })));
      component.approve();
      expect(notifications.show).toHaveBeenCalledWith('No es tu turno de aprobar', 'error');
      expect(component.isActing()).toBeFalse();
    });

    it('shows fallback error message when backend provides none', () => {
      advanceService.approve.and.returnValue(throwError(() => ({})));
      component.approve();
      expect(notifications.show).toHaveBeenCalledWith('Error al aprobar', 'error');
    });
  });

  describe('confirmReject()', () => {
    beforeEach(() => {
      setup();
      component.ngOnInit();
    });

    it('does nothing when there is no advance loaded', () => {
      component.advance.set(null);
      component.rejectForm.patchValue({ rejectionReason: 'a valid long reason' });
      component.confirmReject();
      expect(advanceService.reject).not.toHaveBeenCalled();
    });

    it('does nothing when the reject form is invalid', () => {
      component.rejectForm.patchValue({ rejectionReason: 'short' });
      component.confirmReject();
      expect(advanceService.reject).not.toHaveBeenCalled();
    });

    it('calls advanceService.reject with form value, updates advance and closes modal', () => {
      const updated: IAdvance = { ...baseAdvance, status: 'rejected' };
      advanceService.reject.and.returnValue(of(updated));
      component.showRejectModal.set(true);
      component.rejectForm.patchValue({ rejectionReason: 'No cumple politica de viaticos' });
      component.confirmReject();

      expect(advanceService.reject).toHaveBeenCalledWith('adv-1', { rejectionReason: 'No cumple politica de viaticos' });
      expect(component.advance()).toEqual(updated);
      expect(notifications.show).toHaveBeenCalledWith('Solicitud rechazada', 'success');
      expect(component.showRejectModal()).toBeFalse();
      expect(component.isActing()).toBeFalse();
    });

    it('shows backend error message on failure and keeps modal state controlled by caller', () => {
      advanceService.reject.and.returnValue(throwError(() => ({ error: { message: 'No autorizado' } })));
      component.rejectForm.patchValue({ rejectionReason: 'No cumple politica de viaticos' });
      component.confirmReject();
      expect(notifications.show).toHaveBeenCalledWith('No autorizado', 'error');
      expect(component.isActing()).toBeFalse();
    });
  });

  describe('doCancel()', () => {
    beforeEach(() => {
      setup();
      component.ngOnInit();
    });

    it('does nothing when there is no advance loaded', () => {
      component.advance.set(null);
      component.doCancel();
      expect(advanceService.cancelAdvance).not.toHaveBeenCalled();
    });

    it('calls advanceService.cancelAdvance, updates advance and closes modal', () => {
      const cancelled: IAdvance = { ...baseAdvance, status: 'cancelled' };
      advanceService.cancelAdvance.and.returnValue(of(cancelled));
      component.showCancelModal.set(true);
      component.doCancel();

      expect(advanceService.cancelAdvance).toHaveBeenCalledWith('adv-1');
      expect(component.advance()).toEqual(cancelled);
      expect(component.showCancelModal()).toBeFalse();
      expect(component.isCancelling()).toBeFalse();
      expect(notifications.show).toHaveBeenCalledWith('Solicitud cancelada.', 'success');
    });

    it('shows backend error message on failure', () => {
      advanceService.cancelAdvance.and.returnValue(throwError(() => ({ error: { message: 'No se puede cancelar' } })));
      component.doCancel();
      expect(notifications.show).toHaveBeenCalledWith('No se puede cancelar', 'error');
      expect(component.isCancelling()).toBeFalse();
    });

    it('shows fallback error message when backend provides none', () => {
      advanceService.cancelAdvance.and.returnValue(throwError(() => ({})));
      component.doCancel();
      expect(notifications.show).toHaveBeenCalledWith('Error al cancelar la solicitud.', 'error');
    });
  });

  describe('display helpers', () => {
    beforeEach(() => {
      setup();
      component.ngOnInit();
    });

    it('collaboratorName/collaboratorEmail read from populated userId', () => {
      expect(component.collaboratorName()).toBe('Juan Perez');
      expect(component.collaboratorEmail()).toBe('juan@test.com');
    });

    it('collaboratorName falls back to em dash when userId is unpopulated', () => {
      component.advance.set({ ...baseAdvance, userId: 'user-1' });
      expect(component.collaboratorName()).toBe('—');
    });

    it('projectLabel formats code + name when populated', () => {
      expect(component.projectLabel()).toBe('PRJ1 — Proyecto Uno');
    });

    it('projectLabel falls back to em dash when projectId is unpopulated', () => {
      component.advance.set({ ...baseAdvance, projectId: 'proj-1' });
      expect(component.projectLabel()).toBe('—');
    });

    it('dateRange formats start and end dates', () => {
      expect(component.dateRange()).toContain('al');
    });

    it('dateRange falls back to em dash without dates', () => {
      component.advance.set({ ...baseAdvance, startDate: undefined, endDate: undefined });
      expect(component.dateRange()).toBe('—');
    });

    it('createdAt formats the advance creation date', () => {
      expect(component.createdAt()).not.toBe('—');
    });

    it('lines() returns the advance lines or an empty array', () => {
      expect(component.lines().length).toBe(1);
      component.advance.set({ ...baseAdvance, lines: undefined });
      expect(component.lines()).toEqual([]);
    });

    it('categoryName reads populated category name or em dash', () => {
      const line = component.lines()[0];
      expect(component.categoryName(line)).toBe('Alimentacion');
      expect(component.categoryName({ ...line, categoryId: 'cat-1' })).toBe('—');
    });

    it('historyActionLabel maps known actions and passes through unknown ones', () => {
      expect(component.historyActionLabel('approved')).toBe('Aprobado');
      expect(component.historyActionLabel('rejected')).toBe('Rechazado');
      expect(component.historyActionLabel('resubmitted')).toBe('Reenviado');
      expect(component.historyActionLabel('weird')).toBe('weird');
    });

    it('pendingApproverName returns the current chain entry name or em dash', () => {
      expect(component.pendingApproverName()).toBe('Ana Aprobadora');
      component.advance.set({ ...baseAdvance, approvalLevel: 5 });
      expect(component.pendingApproverName()).toBe('—');
    });
  });

  describe('pipelineSteps() (L1/L2 chain rendering)', () => {
    beforeEach(() => setup());

    it('returns an empty array when there is no advance', () => {
      expect(component.pipelineSteps()).toEqual([]);
    });

    it('builds submitted + one step per approval level + payment step for a 2-level chain', () => {
      advanceService.findOne.and.returnValue(of(baseAdvance));
      component.ngOnInit();
      const steps = component.pipelineSteps();
      // Solicitud enviada + 2 approval levels + pago = 4 steps
      expect(steps.length).toBe(4);
      expect(steps[0].label).toBe('Solicitud enviada');
      expect(steps[0].state).toBe('completed');
      expect(steps[1].state).toBe('active');
      expect(steps[2].state).toBe('upcoming');
      expect(steps[3].label).toBe('Pago registrado');
      expect(steps[3].state).toBe('upcoming');
    });

    it('marks the payment step active once the advance is approved', () => {
      advanceService.findOne.and.returnValue(of({ ...baseAdvance, status: 'approved', approvalLevel: 2 }));
      component.ngOnInit();
      const steps = component.pipelineSteps();
      expect(steps[steps.length - 1].state).toBe('active');
    });

    it('marks the rejected level and leaves subsequent steps upcoming', () => {
      const rejected: IAdvance = {
        ...baseAdvance,
        status: 'rejected',
        approvalHistory: [{ level: 1, approvedBy: 'appr-1', action: 'rejected', date: '2026-01-02T00:00:00Z' }],
      };
      advanceService.findOne.and.returnValue(of(rejected));
      component.ngOnInit();
      const steps = component.pipelineSteps();
      expect(steps[1].state).toBe('rejected');
      expect(steps[2].state).toBe('upcoming');
    });

    it('single-level chain (requiredLevels=1, amount <= S/500) yields submitted + 1 approval + payment', () => {
      const singleLevel: IAdvance = { ...baseAdvance, amount: 300, requiredLevels: 1 };
      advanceService.findOne.and.returnValue(of(singleLevel));
      component.ngOnInit();
      const steps = component.pipelineSteps();
      expect(steps.length).toBe(3);
    });
  });

  describe('status labels/colors', () => {
    beforeEach(() => setup());

    it('exposes ADVANCE_STATUS_LABELS and ADVANCE_STATUS_COLORS for template use', () => {
      expect(component.STATUS_LABELS['pending_l1']).toBe('Pendiente Aprobación');
      expect(component.STATUS_LABELS['approved']).toBe('Aprobado');
      expect(component.STATUS_COLORS['pending_l1']).toContain('yellow');
      expect(component.STATUS_COLORS['approved']).toContain('blue');
    });
  });

  describe('downloadPdf() / downloadExcel() guard conditions', () => {
    beforeEach(() => setup());

    it('downloadPdf does nothing when there is no advance loaded', async () => {
      await component.downloadPdf();
      expect(component.isDownloading()).toBeFalse();
    });

    it('downloadExcel does nothing when there is no advance loaded', async () => {
      await component.downloadExcel();
      expect(component.isDownloading()).toBeFalse();
    });

    it('downloadPdf is a no-op re-entry guard while already downloading', async () => {
      component.ngOnInit();
      component.isDownloading.set(true);
      await component.downloadPdf();
      // Guard should prevent starting a second run; isDownloading remains true (untouched by this call)
      expect(component.isDownloading()).toBeTrue();
    });
  });
});
