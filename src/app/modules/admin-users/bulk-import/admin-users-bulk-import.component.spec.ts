import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminUsersBulkImportComponent } from './admin-users-bulk-import.component';
import { NotificationService } from '../../../services/notification.service';
import { AdminUsersService } from '../services/admin-users.service';
import { UserStateService } from '../../../services/user-state.service';

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
    expect(component.file).toBeNull();
    expect(component.result).toBeNull();
  });

  describe('back', () => {
    it('navigates to the users list', () => {
      component.back();
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users']);
    });
  });

  describe('onFileChange', () => {
    it('stores the selected file and clears any previous result', () => {
      const file = new File(['data'], 'users.xlsx');
      component.result = { created: 1, skipped: [], errors: [], credentials: [] };
      const event = { target: { files: [file] } } as unknown as Event;

      component.onFileChange(event);

      expect(component.file).toBe(file);
      expect(component.result).toBeNull();
    });

    it('sets file to null when no file is chosen', () => {
      const event = { target: { files: [] } } as unknown as Event;
      component.onFileChange(event);
      expect(component.file).toBeNull();
    });
  });

  describe('import', () => {
    it('shows an error when no file has been selected', () => {
      component.import();
      expect(notification.show).toHaveBeenCalledWith('Selecciona un archivo Excel primero', 'error');
      expect(adminUsersService.bulkImportUsers).not.toHaveBeenCalled();
    });

    it('uploads the file with the resolved companyId and stores the result', () => {
      component.file = new File(['data'], 'users.xlsx');
      const response = { created: 3, skipped: ['a@test.com'], errors: [], credentials: [
        { name: 'A', email: 'a@test.com', temporaryPassword: 'x' },
      ] };
      adminUsersService.bulkImportUsers.and.returnValue(of(response));

      component.import();

      expect(adminUsersService.bulkImportUsers).toHaveBeenCalled();
      const fd = adminUsersService.bulkImportUsers.calls.mostRecent().args[0] as FormData;
      expect(fd.get('clientId')).toBe('c1');
      expect(component.loading).toBeFalse();
      expect(component.result).toEqual(response);
      expect(notification.show).toHaveBeenCalledWith('Importación completada: 3 creados', 'success');
    });

    it('shows an error notification and resets loading on failure', () => {
      component.file = new File(['data'], 'users.xlsx');
      adminUsersService.bulkImportUsers.and.returnValue(throwError(() => new Error('fail')));

      component.import();

      expect(component.loading).toBeFalse();
      expect(notification.show).toHaveBeenCalledWith('Error al importar usuarios', 'error');
    });
  });

  describe('downloadTemplate', () => {
    it('triggers a download when the template is fetched successfully', () => {
      adminUsersService.downloadUserTemplate.and.returnValue(of({ file: btoa('hello'), filename: 'template.xlsx' }));
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(() => {});

      component.downloadTemplate();

      expect(adminUsersService.downloadUserTemplate).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('shows an error notification when the download fails', () => {
      adminUsersService.downloadUserTemplate.and.returnValue(throwError(() => new Error('fail')));

      component.downloadTemplate();

      expect(notification.show).toHaveBeenCalledWith('Error al descargar plantilla', 'error');
    });
  });

  describe('downloadCredentials', () => {
    it('does nothing when there are no credentials', () => {
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(() => {});
      component.result = { created: 0, skipped: [], errors: [], credentials: [] };
      component.downloadCredentials();
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('builds and downloads a CSV when credentials are present', () => {
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(() => {});
      component.result = {
        created: 1, skipped: [], errors: [],
        credentials: [{ name: 'A', email: 'a@test.com', temporaryPassword: 'x' }],
      };
      component.downloadCredentials();
      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
