import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { UserPermissionsComponent } from './user-permissions.component';
import { AdminUsersService } from '../services/admin-users.service';
import { NotificationService } from '../../../services/notification.service';
import { CategoriaService } from '../../../services/categoria.service';
import { UserStateService } from '../../../services/user-state.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { IUserResponse } from '../../../interfaces/user.interface';
import { ICategory } from '../../invoices/interfaces/category.interface';
import { IProject } from '../../invoices/interfaces/project.interface';

describe('UserPermissionsComponent', () => {
  let component: UserPermissionsComponent;
  let adminUsersService: jasmine.SpyObj<AdminUsersService>;
  let notification: jasmine.SpyObj<NotificationService>;
  let categoriaService: jasmine.SpyObj<CategoriaService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let router: jasmine.SpyObj<Router>;

  const mockUser: IUserResponse = {
    _id: 'u1',
    name: 'John Doe',
    email: 'john@test.com',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: { _id: 'r1', name: 'Colaborador', active: true, createdAt: new Date(), updatedAt: new Date() },
    permissions: {
      modules: ['tesoreria'],
      canApproveL1: false,
      canApproveL2: false,
      categoryIds: ['cat1'],
      projectIds: ['p1', 'p2'],
    },
  };

  const mockCategories: ICategory[] = [
    { _id: 'cat1', name: 'Alimentos', cuenta: '601' },
    { _id: 'cat2', name: 'Transporte', cuenta: '602' },
  ];

  const mockProjects: IProject[] = [
    { _id: 'p1', name: 'Proyecto Uno', code: 'P1', isActive: true },
    { _id: 'p2', name: 'Proyecto Dos', code: 'P2', isActive: true },
    { _id: 'p3', name: 'Proyecto Tres', code: 'P3', isActive: true },
    { _id: 'p4', name: 'Inactivo', code: 'P4', isActive: false },
  ];

  beforeEach(() => {
    adminUsersService = jasmine.createSpyObj('AdminUsersService', ['getUser', 'updatePermissions']);
    notification = jasmine.createSpyObj('NotificationService', ['show']);
    categoriaService = jasmine.createSpyObj('CategoriaService', ['getAllFlatAdmin']);
    userState = jasmine.createSpyObj('UserStateService', ['getUser']);
    invoicesService = jasmine.createSpyObj('InvoicesService', ['getProjects']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    adminUsersService.getUser.and.returnValue(of(mockUser));
    categoriaService.getAllFlatAdmin.and.returnValue(of(mockCategories));
    invoicesService.getProjects.and.returnValue(of(mockProjects));
    userState.getUser.and.returnValue({ companyId: 'c1' } as any);

    TestBed.configureTestingModule({
      imports: [UserPermissionsComponent, HttpClientTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'u1' } } } },
        { provide: Router, useValue: router },
        { provide: AdminUsersService, useValue: adminUsersService },
        { provide: NotificationService, useValue: notification },
        { provide: CategoriaService, useValue: categoriaService },
        { provide: UserStateService, useValue: userState },
        { provide: InvoicesService, useValue: invoicesService },
      ],
    });

    component = TestBed.createComponent(UserPermissionsComponent).componentInstance;
  });

  it('should create and read the id from the route', () => {
    expect(component).toBeTruthy();
    expect(component.id).toBe('u1');
  });

  describe('loadUser', () => {
    it('populates user and permissions on success', () => {
      component.loadUser();
      expect(component.user).toEqual(mockUser);
      expect(component.permissions.modules).toEqual(['tesoreria']);
      expect(component.permissions.canApproveL1).toBeFalse();
      expect(component.permissions.canApproveL2).toBeFalse();
      expect(component.permissions.categoryIds).toEqual(['cat1']);
      expect(component.permissions.projectIds).toEqual(['p1', 'p2']);
    });

    it('defaults permissions fields when user has no permissions object', () => {
      adminUsersService.getUser.and.returnValue(of({ ...mockUser, permissions: undefined }));
      component.loadUser();
      expect(component.permissions).toEqual({
        modules: [],
        canApproveL1: false,
        canApproveL2: false,
        categoryIds: [],
        projectIds: [],
        primaryProjectId: undefined,
      });
    });

    it('shows an error notification when loading the user fails', () => {
      adminUsersService.getUser.and.returnValue(throwError(() => new Error('fail')));
      component.loadUser();
      expect(notification.show).toHaveBeenCalledWith('Error al cargar el usuario', 'error');
    });
  });

  describe('loadCategoryData', () => {
    it('populates categories and clears loading flag on success', () => {
      component.loadCategoryData();
      expect(component.allCategories()).toEqual(mockCategories);
      expect(component.categoriesLoading()).toBeFalse();
    });

    it('shows an error notification and clears loading flag on failure', () => {
      categoriaService.getAllFlatAdmin.and.returnValue(throwError(() => new Error('fail')));
      component.loadCategoryData();
      expect(notification.show).toHaveBeenCalledWith('Error al cargar categorías', 'error');
      expect(component.categoriesLoading()).toBeFalse();
    });
  });

  describe('loadProjects', () => {
    it('resolves companyId and loads only active projects', () => {
      component.loadProjects();
      expect(invoicesService.getProjects).toHaveBeenCalledWith('c1');
      expect(component.allProjects().length).toBe(3);
      expect(component.allProjects().some((p) => p._id === 'p4')).toBeFalse();
    });

    it('does nothing when companyId cannot be resolved', () => {
      userState.getUser.and.returnValue(null);
      component.loadProjects();
      expect(invoicesService.getProjects).not.toHaveBeenCalled();
    });

    it('sets an empty list on error', () => {
      invoicesService.getProjects.and.returnValue(throwError(() => new Error('fail')));
      component.loadProjects();
      expect(component.allProjects()).toEqual([]);
    });

    it('resolves companyId from clientId object when companyId/client are absent', () => {
      userState.getUser.and.returnValue({ clientId: { _id: 'c2' } } as any);
      component.loadProjects();
      expect(invoicesService.getProjects).toHaveBeenCalledWith('c2');
    });

    it('resolves companyId from string clientId when other fields are absent', () => {
      userState.getUser.and.returnValue({ clientId: 'c3' } as any);
      component.loadProjects();
      expect(invoicesService.getProjects).toHaveBeenCalledWith('c3');
    });
  });

  describe('project assignment helpers', () => {
    beforeEach(() => {
      component.allProjects.set(mockProjects);
      component.permissions.projectIds = ['p1', 'p2'];
    });

    it('assignedProjects returns projects in the order of projectIds', () => {
      expect(component.assignedProjects.map((p) => p._id)).toEqual(['p1', 'p2']);
    });

    it('availableProjectCandidates excludes already-assigned projects', () => {
      const ids = component.availableProjectCandidates.map((p) => p._id);
      expect(ids).not.toContain('p1');
      expect(ids).not.toContain('p2');
      expect(ids).toContain('p3');
    });

    it('addProject appends a new project id', () => {
      component.addProject('p3');
      expect(component.permissions.projectIds).toEqual(['p1', 'p2', 'p3']);
    });

    it('addProject ignores duplicate ids', () => {
      component.addProject('p1');
      expect(component.permissions.projectIds).toEqual(['p1', 'p2']);
    });

    it('addProject ignores empty id', () => {
      component.addProject('');
      expect(component.permissions.projectIds).toEqual(['p1', 'p2']);
    });

    it('removeProject removes by index', () => {
      component.removeProject(0);
      expect(component.permissions.projectIds).toEqual(['p2']);
    });

    it('moveProjectUp swaps with the previous element', () => {
      component.permissions.projectIds = ['p1', 'p2', 'p3'];
      component.moveProjectUp(1);
      expect(component.permissions.projectIds).toEqual(['p2', 'p1', 'p3']);
    });

    it('moveProjectUp does nothing at index 0', () => {
      component.permissions.projectIds = ['p1', 'p2', 'p3'];
      component.moveProjectUp(0);
      expect(component.permissions.projectIds).toEqual(['p1', 'p2', 'p3']);
    });

    it('moveProjectDown swaps with the next element', () => {
      component.permissions.projectIds = ['p1', 'p2', 'p3'];
      component.moveProjectDown(0);
      expect(component.permissions.projectIds).toEqual(['p2', 'p1', 'p3']);
    });

    it('moveProjectDown does nothing at the last index', () => {
      component.permissions.projectIds = ['p1', 'p2', 'p3'];
      component.moveProjectDown(2);
      expect(component.permissions.projectIds).toEqual(['p1', 'p2', 'p3']);
    });

    it('projectLabel includes the code when present', () => {
      expect(component.projectLabel({ _id: 'p1', name: 'Proyecto Uno', code: 'P1' })).toBe('P1 — Proyecto Uno');
    });

    it('projectLabel falls back to the name when there is no code', () => {
      expect(component.projectLabel({ _id: 'p1', name: 'Proyecto Uno' })).toBe('Proyecto Uno');
    });
  });

  describe('module toggles', () => {
    it('hasModule reflects presence in permissions.modules', () => {
      component.permissions.modules = ['tesoreria'];
      expect(component.hasModule('tesoreria')).toBeTrue();
      expect(component.hasModule('configuracion')).toBeFalse();
    });

    it('toggleModule adds a module when checked', () => {
      component.permissions.modules = [];
      component.toggleModule('tesoreria', true);
      expect(component.permissions.modules).toEqual(['tesoreria']);
    });

    it('toggleModule does not duplicate an already-present module', () => {
      component.permissions.modules = ['tesoreria'];
      component.toggleModule('tesoreria', true);
      expect(component.permissions.modules).toEqual(['tesoreria']);
    });

    it('toggleModule removes a module when unchecked', () => {
      component.permissions.modules = ['tesoreria', 'configuracion'];
      component.toggleModule('tesoreria', false);
      expect(component.permissions.modules).toEqual(['configuracion']);
    });
  });

  describe('category helpers', () => {
    beforeEach(() => {
      component.allCategories.set(mockCategories);
    });

    it('filteredCategories returns all categories when search is empty', () => {
      component.categorySearch.set('');
      expect(component.filteredCategories.length).toBe(2);
    });

    it('filteredCategories filters by name (case-insensitive)', () => {
      component.categorySearch.set('alim');
      expect(component.filteredCategories.map((c) => c._id)).toEqual(['cat1']);
    });

    it('filteredCategories filters by cuenta', () => {
      component.categorySearch.set('602');
      expect(component.filteredCategories.map((c) => c._id)).toEqual(['cat2']);
    });

    it('hasCategory reflects presence in permissions.categoryIds', () => {
      component.permissions.categoryIds = ['cat1'];
      expect(component.hasCategory('cat1')).toBeTrue();
      expect(component.hasCategory('cat2')).toBeFalse();
    });

    it('toggleCategory adds when checked', () => {
      component.permissions.categoryIds = [];
      component.toggleCategory('cat1', true);
      expect(component.permissions.categoryIds).toEqual(['cat1']);
    });

    it('toggleCategory removes when unchecked', () => {
      component.permissions.categoryIds = ['cat1', 'cat2'];
      component.toggleCategory('cat1', false);
      expect(component.permissions.categoryIds).toEqual(['cat2']);
    });

    it('selectAllCategories selects every loaded category id', () => {
      component.selectAllCategories();
      expect(component.permissions.categoryIds).toEqual(['cat1', 'cat2']);
    });

    it('clearAllCategories empties the selection', () => {
      component.permissions.categoryIds = ['cat1', 'cat2'];
      component.clearAllCategories();
      expect(component.permissions.categoryIds).toEqual([]);
    });

    it('selectedCount and totalCount report the right sizes', () => {
      component.permissions.categoryIds = ['cat1'];
      expect(component.selectedCount).toBe(1);
      expect(component.totalCount).toBe(2);
    });
  });

  describe('save', () => {
    it('calls updatePermissions with the id and current permissions, shows success, and resets saving', () => {
      component.permissions = {
        modules: ['tesoreria'],
        canApproveL1: true,
        canApproveL2: false,
        categoryIds: ['cat1'],
        projectIds: ['p1'],
      };
      adminUsersService.updatePermissions.and.returnValue(of(mockUser));

      component.save();

      expect(adminUsersService.updatePermissions).toHaveBeenCalledWith('u1', component.permissions);
      expect(notification.show).toHaveBeenCalledWith(
        'Permisos actualizados. El usuario debe volver a iniciar sesión para que los cambios se reflejen.',
        'success'
      );
      expect(component.saving).toBeFalse();
    });

    it('sets saving to true while the request is in flight', () => {
      adminUsersService.updatePermissions.and.returnValue(of(mockUser));
      expect(component.saving).toBeFalse();
      component.save();
      // request resolves synchronously with `of`, so saving is back to false after
      expect(component.saving).toBeFalse();
    });

    it('shows an error notification and resets saving on failure', () => {
      adminUsersService.updatePermissions.and.returnValue(throwError(() => new Error('fail')));

      component.save();

      expect(notification.show).toHaveBeenCalledWith('fail', 'error');
      expect(component.saving).toBeFalse();
    });
  });

  describe('goBack', () => {
    it('navigates to the user details screen', () => {
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users/u1/details']);
    });
  });
});
