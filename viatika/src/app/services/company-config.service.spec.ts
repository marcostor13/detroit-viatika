import { TestBed } from '@angular/core/testing';
import { CompanyConfigService } from './company-config.service';
import { InvoicesService } from '../modules/invoices/services/invoices.service';
import { UserStateService } from './user-state.service';
import { UploadService } from './upload.service';
import { Subject, of, throwError } from 'rxjs';
import { ICompanyConfig } from '../interfaces/company-config.interface';

const mockConfig: ICompanyConfig = {
  _id: 'c1',
  companyId: 'c1',
  name: 'Test Co',
  businessName: 'Test Co SA',
  logo: '',
};

const mockInvoicesService = jasmine.createSpyObj('InvoicesService', [
  'getCompanyConfig',
  'updateCompanyConfig',
]);

const mockUserStateService = jasmine.createSpyObj('UserStateService', [
  'getUser',
  'isAuthenticated',
  'isAdmin',
  'isSuperAdmin',
  'isContabilidad',
]);

const mockUploadService = jasmine.createSpyObj('UploadService', ['uploadFile']);

describe('CompanyConfigService', () => {
  let service: CompanyConfigService;

  beforeEach(() => {
    mockUserStateService.getUser.and.returnValue({ _id: 'u1', companyId: 'c1', client: { _id: 'c1' } } as any);
    mockUserStateService.isAuthenticated.and.returnValue(true);
    mockUserStateService.isAdmin.and.returnValue(true);
    mockUserStateService.isSuperAdmin.and.returnValue(false);
    mockUserStateService.isContabilidad.and.returnValue(false);
    mockInvoicesService.getCompanyConfig.and.returnValue(of(mockConfig));
    mockInvoicesService.updateCompanyConfig.and.returnValue(of(mockConfig));

    TestBed.configureTestingModule({
      providers: [
        CompanyConfigService,
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: UserStateService, useValue: mockUserStateService },
        { provide: UploadService, useValue: mockUploadService },
      ],
    });

    service = TestBed.inject(CompanyConfigService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initCompanyConfig / getCompanyConfig', () => {
    it('returns the default config set during init', () => {
      const config = service.getCompanyConfig();
      expect(config).not.toBeNull();
      expect(config!.companyId).toBe('c1');
    });

    it('companyConfig$ emits a value on subscribe', (done) => {
      service.companyConfig$.subscribe(config => {
        expect(config).not.toBeNull();
        done();
      });
    });
  });

  describe('setCompanyConfig', () => {
    it('updates the config and emits via companyConfig$', (done) => {
      const newConfig: ICompanyConfig = { ...mockConfig, name: 'Updated Co' };
      service.setCompanyConfig(newConfig);
      service.companyConfig$.subscribe(config => {
        expect(config!.name).toBe('Updated Co');
        done();
      });
    });
  });

  describe('updateCompanyName', () => {
    it('calls invoicesService.updateCompanyConfig and emits updated config', (done) => {
      service.updateCompanyName('New Name').subscribe(config => {
        expect(mockInvoicesService.updateCompanyConfig).toHaveBeenCalledWith(
          'c1',
          jasmine.objectContaining({ name: 'New Name', businessName: 'New Name' })
        );
        done();
      });
    });

    it('throws Error when no companyId is available', () => {
      service.setCompanyConfig({ _id: '', companyId: '', name: '', businessName: '', logo: '' });
      expect(() => service.updateCompanyName('X')).toThrowError('No se encontró companyId');
    });
  });

  describe('updateLimits', () => {
    it('calls invoicesService.updateCompanyConfig with limits payload', (done) => {
      service.updateLimits('c1', { movilidadDiario: 50 }).subscribe(config => {
        expect(mockInvoicesService.updateCompanyConfig).toHaveBeenCalledWith(
          'c1',
          jasmine.objectContaining({ limits: { movilidadDiario: 50 } })
        );
        done();
      });
    });

    it('emits updated config and updates internal state', (done) => {
      const updatedConfig = { ...mockConfig, name: 'With Limits' };
      mockInvoicesService.updateCompanyConfig.and.returnValue(of(updatedConfig));
      service.updateLimits('c1', { movilidadDiario: 100 }).subscribe(config => {
        expect(service.getCompanyConfig()!.name).toBe('With Limits');
        done();
      });
    });

    it('propagates errors from invoicesService', (done) => {
      mockInvoicesService.updateCompanyConfig.and.returnValue(throwError(() => new Error('Server error')));
      service.updateLimits('c1', {}).subscribe({
        error: (err) => {
          expect(err.message).toBe('Server error');
          done();
        },
      });
    });
  });

  describe('uploadCompanyLogo', () => {
    it('emits error type when companyId is not available', async () => {
      service.setCompanyConfig({ _id: '', companyId: '', name: '', businessName: '', logo: '' });
      const file = new File([''], 'logo.png', { type: 'image/png' });
      const events: any[] = [];
      await new Promise<void>((resolve) => {
        service.uploadCompanyLogo(file, '').subscribe({
          next: (event) => events.push(event),
          error: () => resolve(),
        });
      });
      expect(events.some(e => e.type === 'error')).toBeTrue();
    });

    it('emits progress events when upload service streams progress', (done) => {
      service.setCompanyConfig(mockConfig);
      const file = new File([''], 'logo.png', { type: 'image/png' });
      const progressSubject = new Subject<number>();
      const urlSubject = new Subject<string>();
      mockUploadService.uploadFile.and.returnValue({
        uploadProgress$: progressSubject.asObservable(),
        downloadUrl$: urlSubject.asObservable(),
      });

      const events: any[] = [];
      service.uploadCompanyLogo(file, 'c1').subscribe({
        next: (event) => events.push(event),
        error: () => done.fail('should not error'),
      });

      progressSubject.next(50);
      expect(events.length).toBe(1);
      expect(events[0]).toEqual({ progress: 50, type: 'progress' });
      done();
    });
  });
});
