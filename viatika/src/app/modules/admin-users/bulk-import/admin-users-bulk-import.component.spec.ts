import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminUsersBulkImportComponent } from './admin-users-bulk-import.component';
import { NotificationService } from '../../../services/notification.service';
import {
  AdminUsersService,
  IUserBulkImportResult,
} from '../services/admin-users.service';
import { UserStateService } from '../../../services/user-state.service';

/** Resultado del backend con los valores por defecto de un plan vacío. */
const plan = (
  over: Partial<IUserBulkImportResult> = {}
): IUserBulkImportResult => ({
  created: 0,
  updated: 0,
  unchanged: 0,
  errors: [],
  rows: [],
  credentials: [],
  dryRun: false,
  ...over,
});

describe('AdminUsersBulkImportComponent', () => {
  let component: AdminUsersBulkImportComponent;
  let router: jasmine.SpyObj<Router>;
  let notification: jasmine.SpyObj<NotificationService>;
  let adminUsersService: jasmine.SpyObj<AdminUsersService>;
  let userStateService: jasmine.SpyObj<UserStateService>;

  beforeEach(() => {
    router = jasmine.createSpyObj('Router', ['navigate']);
    notification = jasmine.createSpyObj('NotificationService', ['show']);
    adminUsersService = jasmine.createSpyObj('AdminUsersService', ['downloadUserTemplate', 'bulkImportUsers']);
    userStateService = jasmine.createSpyObj('UserStateService', ['getUser']);

    userStateService.getUser.and.returnValue({ companyId: 'c1' } as any);

    TestBed.configureTestingModule({
      imports: [AdminUsersBulkImportComponent],
      providers: [
        { provide: Router, useValue: router },
        { provide: NotificationService, useValue: notification },
        { provide: AdminUsersService, useValue: adminUsersService },
        { provide: UserStateService, useValue: userStateService },
      ],
    });

    component = TestBed.createComponent(AdminUsersBulkImportComponent).componentInstance;
  });

  it('creates with no file selected and no result yet', () => {
    expect(component).toBeTruthy();
    expect(component.file()).toBeNull();
    expect(component.result()).toBeNull();
    expect(component.importPreview()).toBeNull();
  });

  describe('back', () => {
    it('navigates to the users list', () => {
      component.back();
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users']);
    });
  });

  describe('onFileChange', () => {
    it('asks the backend for the plan without writing anything', () => {
      const file = new File(['data'], 'users.xlsx');
      const preview = plan({ created: 2, updated: 1, dryRun: true });
      adminUsersService.bulkImportUsers.and.returnValue(of(preview));
      component.result.set(plan({ created: 1 }));

      component.onFileChange({ target: { files: [file] } } as unknown as Event);

      expect(component.file()).toBe(file);
      expect(component.result()).toBeNull();
      const fd = adminUsersService.bulkImportUsers.calls.mostRecent().args[0] as FormData;
      expect(fd.get('clientId')).toBe('c1');
      expect(fd.get('dryRun')).toBe('true');
      expect(component.importPreview()).toEqual(preview);
      expect(component.previewing()).toBeFalse();
    });

    it('sets file to null and asks for nothing when no file is chosen', () => {
      component.onFileChange({ target: { files: [] } } as unknown as Event);
      expect(component.file()).toBeNull();
      expect(adminUsersService.bulkImportUsers).not.toHaveBeenCalled();
    });

    it('notifies when the preview fails', () => {
      adminUsersService.bulkImportUsers.and.returnValue(throwError(() => new Error('fail')));
      component.onFileChange({
        target: { files: [new File(['data'], 'users.xlsx')] },
      } as unknown as Event);

      expect(component.previewing()).toBeFalse();
      expect(notification.show).toHaveBeenCalledWith('Error al revisar el archivo', 'error');
    });
  });

  describe('previewImport', () => {
    it('shows an error when no file has been selected', () => {
      component.previewImport();
      expect(notification.show).toHaveBeenCalledWith('Selecciona un archivo Excel primero', 'error');
      expect(adminUsersService.bulkImportUsers).not.toHaveBeenCalled();
    });
  });

  describe('confirmImport', () => {
    beforeEach(() => {
      component.file.set(new File(['data'], 'users.xlsx'));
    });

    it('does nothing while there is nothing to create or update', () => {
      component.importPreview.set(plan({ unchanged: 3, dryRun: true }));
      expect(component.puedeConfirmarImport).toBeFalse();

      component.confirmImport();

      expect(adminUsersService.bulkImportUsers).not.toHaveBeenCalled();
    });

    it('writes the file and reports what happened', () => {
      component.importPreview.set(plan({ created: 3, updated: 1, dryRun: true }));
      const response = plan({
        created: 3,
        updated: 1,
        credentials: [{ name: 'A', email: 'a@test.com', temporaryPassword: 'x' }],
      });
      adminUsersService.bulkImportUsers.and.returnValue(of(response));

      component.confirmImport();

      const fd = adminUsersService.bulkImportUsers.calls.mostRecent().args[0] as FormData;
      expect(fd.get('clientId')).toBe('c1');
      expect(fd.get('dryRun')).toBeNull();
      expect(component.importing()).toBeFalse();
      expect(component.importPreview()).toBeNull();
      expect(component.result()).toEqual(response);
      expect(notification.show).toHaveBeenCalledWith(
        'Importación completada: 3 creado(s) y 1 con permisos actualizados',
        'success'
      );
    });

    it('warns about rows that failed', () => {
      component.importPreview.set(plan({ created: 1, dryRun: true }));
      adminUsersService.bulkImportUsers.and.returnValue(
        of(plan({ created: 1, errors: [{ row: 4, reason: 'Email inválido' }] }))
      );

      component.confirmImport();

      expect(notification.show).toHaveBeenCalledWith('1 fila(s) con error', 'warning');
    });

    it('shows an error notification and resets loading on failure', () => {
      component.importPreview.set(plan({ created: 1, dryRun: true }));
      adminUsersService.bulkImportUsers.and.returnValue(throwError(() => new Error('fail')));

      component.confirmImport();

      expect(component.importing()).toBeFalse();
      expect(notification.show).toHaveBeenCalledWith('Error al importar usuarios', 'error');
    });
  });

  describe('cancelImport', () => {
    it('closes the review without writing anything', () => {
      component.importPreview.set(plan({ created: 1, dryRun: true }));
      component.filtroAccion.set('crear');
      component.busquedaPreview.set('a@');

      component.cancelImport();

      expect(component.importPreview()).toBeNull();
      expect(component.filtroAccion()).toBeNull();
      expect(component.busquedaPreview()).toBe('');
    });
  });

  describe('filtros de la revisión', () => {
    beforeEach(() => {
      component.importPreview.set(
        plan({
          created: 1,
          updated: 1,
          errors: [{ row: 4, reason: 'Email inválido' }],
          rows: [
            { row: 2, email: 'nuevo@test.com', accion: 'crear', detalle: 'Rol: Colaborador' },
            { row: 3, email: 'viejo@test.com', accion: 'actualizar', detalle: 'Centros de costo: — → CC-001' },
            { row: 4, email: 'malo', accion: 'error', reason: 'Email inválido' },
          ],
          dryRun: true,
        })
      );
    });

    it('counts each action from the plan', () => {
      expect(component.conteoAccion('crear')).toBe(1);
      expect(component.conteoAccion('actualizar')).toBe(1);
      expect(component.conteoAccion('error')).toBe(1);
    });

    it('filters by action and toggles the chip off on a second click', () => {
      component.toggleFiltroAccion('error');
      expect(component.filasVisibles().map((f) => f.row)).toEqual([4]);

      component.toggleFiltroAccion('error');
      expect(component.filtroAccion()).toBeNull();
      expect(component.filasVisibles().length).toBe(3);
    });

    it('searches by email, detail and row number', () => {
      component.busquedaPreview.set('CC-001');
      expect(component.filasVisibles().map((f) => f.row)).toEqual([3]);

      component.busquedaPreview.set('2');
      expect(component.filasVisibles().map((f) => f.row)).toEqual([2]);
    });
  });

  describe('downloadTemplate', () => {
    it('triggers a download when the template is fetched successfully', () => {
      adminUsersService.downloadUserTemplate.and.returnValue(of({ file: btoa('hello'), filename: 'template.xlsx' }));
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(() => {});

      component.downloadTemplate();

      expect(adminUsersService.downloadUserTemplate).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(component.downloadingTemplate()).toBeFalse();
    });

    it('shows an error notification when the download fails', () => {
      adminUsersService.downloadUserTemplate.and.returnValue(throwError(() => new Error('fail')));

      component.downloadTemplate();

      expect(notification.show).toHaveBeenCalledWith('Error al descargar plantilla', 'error');
      expect(component.downloadingTemplate()).toBeFalse();
    });
  });

  describe('downloadCredentials', () => {
    it('does nothing when there are no credentials', () => {
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(() => {});
      component.result.set(plan());
      component.downloadCredentials();
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('builds and downloads a CSV when credentials are present', () => {
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(() => {});
      component.result.set(
        plan({
          created: 1,
          credentials: [{ name: 'A', email: 'a@test.com', temporaryPassword: 'x' }],
        })
      );
      component.downloadCredentials();
      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
