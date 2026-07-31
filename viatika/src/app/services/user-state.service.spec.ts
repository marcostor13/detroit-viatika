import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { UserStateService } from './user-state.service';
import { USER_LOCALSTORAGE_KEY } from '../constants/user-localstorage.constant';
import { IUserResponse } from '../interfaces/user.interface';

const makeUser = (overrides: Partial<IUserResponse> = {}): IUserResponse => ({
  _id: 'u1',
  name: 'Test User',
  email: 'test@test.com',
  isActive: true,
  role: { _id: 'r1', name: 'Colaborador', active: true, createdAt: new Date(), updatedAt: new Date() },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('UserStateService — empty localStorage', () => {
  let service: UserStateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(UserStateService);
  });

  afterEach(() => localStorage.clear());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initial state', () => {
    it('getUser() returns null when localStorage is empty', () => {
      expect(service.getUser()).toBeNull();
    });

    it('getToken() returns null when no user or token stored', () => {
      expect(service.getToken()).toBeNull();
    });

    it('isAuthenticated() returns false when no user', () => {
      expect(service.isAuthenticated()).toBeFalse();
    });

    it('getRole() returns empty string when no user', () => {
      expect(service.getRole()).toBe('');
    });

    it('isColaborador() returns false when no user', () => {
      expect(service.isColaborador()).toBeFalse();
    });

    it('isAdmin() returns false when no user', () => {
      expect(service.isAdmin()).toBeFalse();
    });

    it('isSuperAdmin() returns false when no user', () => {
      expect(service.isSuperAdmin()).toBeFalse();
    });

    it('isAnyAdmin() returns false when no user', () => {
      expect(service.isAnyAdmin()).toBeFalse();
    });

    it('getPermissions() returns default permissions when no user', () => {
      expect(service.getPermissions()).toEqual({ modules: [], canApproveL1: false, canApproveL2: false });
    });

    it('hasModulePermission() returns false for Colaborador with no permissions', () => {
      service.setUser(makeUser());
      expect(service.hasModulePermission('tesoreria')).toBeFalse();
    });

    it('canApproveL1() returns false when no user', () => {
      expect(service.canApproveL1()).toBeFalse();
    });

    it('canApproveL2() returns false when no user', () => {
      expect(service.canApproveL2()).toBeFalse();
    });

    it('canAccessTesoreria() returns false when no user', () => {
      expect(service.canAccessTesoreria()).toBeFalse();
    });
  });

  describe('setUser()', () => {
    it('should update the signal', () => {
      const user = makeUser();
      service.setUser(user);
      expect(service.getUser()).toEqual(jasmine.objectContaining({ _id: 'u1' }));
    });

    it('should persist to localStorage', () => {
      const user = makeUser();
      service.setUser(user);
      const stored = JSON.parse(localStorage.getItem(USER_LOCALSTORAGE_KEY)!);
      expect(stored._id).toBe('u1');
    });

    it('should store the access token separately', () => {
      service.setUser(makeUser({ access_token: 'tok123' }));
      expect(localStorage.getItem('token')).toBe('tok123');
    });

    it('should not store token key when access_token is absent', () => {
      service.setUser(makeUser());
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('should map companyId from clientId._id when companyId is absent', () => {
      const user = makeUser({ clientId: { _id: 'client99' } } as any);
      service.setUser(user);
      expect(service.getUser()!.companyId).toBe('client99');
    });
  });

  describe('getToken()', () => {
    it('should return access_token from signal when set', () => {
      service.setUser(makeUser({ access_token: 'from-signal' }));
      expect(service.getToken()).toBe('from-signal');
    });

    it('should fall back to localStorage token when user has no access_token', () => {
      localStorage.setItem('token', 'fallback-token');
      service.setUser(makeUser());
      // signal user has no access_token → falls back to localStorage
      expect(service.getToken()).toBe('fallback-token');
    });
  });

  describe('clearUser()', () => {
    it('should set user to null', () => {
      service.setUser(makeUser());
      service.clearUser();
      expect(service.getUser()).toBeNull();
    });

    it('should remove user from localStorage', () => {
      service.setUser(makeUser());
      service.clearUser();
      expect(localStorage.getItem(USER_LOCALSTORAGE_KEY)).toBeNull();
    });

    it('should remove token from localStorage', () => {
      service.setUser(makeUser({ access_token: 'tok' }));
      service.clearUser();
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('logout()', () => {
    it('should clear the user', () => {
      service.setUser(makeUser());
      service.logout();
      expect(service.getUser()).toBeNull();
    });
  });

  describe('isAuthenticated()', () => {
    it('should return true when user and token are set', () => {
      service.setUser(makeUser({ access_token: 'tok' }));
      expect(service.isAuthenticated()).toBeTrue();
    });

    it('should return false after clearUser()', () => {
      service.setUser(makeUser({ access_token: 'tok' }));
      service.clearUser();
      expect(service.isAuthenticated()).toBeFalse();
    });
  });

  describe('getRole()', () => {
    it('should return role name from string role', () => {
      service.setUser(makeUser({ role: 'Administrador' as any }));
      expect(service.getRole()).toBe('Administrador');
    });

    it('should return role name from object role', () => {
      service.setUser(makeUser());
      expect(service.getRole()).toBe('Colaborador');
    });

    it('should return name from roleId.name when role has no name', () => {
      const user = makeUser({ role: {} as any, roleId: { name: 'Administrador' } as any });
      service.setUser(user);
      expect(service.getRole()).toBe('Administrador');
    });
  });

  describe('role checks', () => {
    it('isColaborador() returns true for Colaborador', () => {
      service.setUser(makeUser());
      expect(service.isColaborador()).toBeTrue();
    });

    it('isAdmin() returns true for Administrador', () => {
      const role = { _id: 'r2', name: 'Administrador', active: true, createdAt: new Date(), updatedAt: new Date() };
      service.setUser(makeUser({ role }));
      expect(service.isAdmin()).toBeTrue();
    });

    it('isSuperAdmin() returns true for Superadministrador', () => {
      const role = { _id: 'r3', name: 'Superadministrador', active: true, createdAt: new Date(), updatedAt: new Date() };
      service.setUser(makeUser({ role }));
      expect(service.isSuperAdmin()).toBeTrue();
    });

    it('isAnyAdmin() returns true for Administrador', () => {
      const role = { _id: 'r2', name: 'Administrador', active: true, createdAt: new Date(), updatedAt: new Date() };
      service.setUser(makeUser({ role }));
      expect(service.isAnyAdmin()).toBeTrue();
    });

    it('isAnyAdmin() returns true for Superadministrador', () => {
      const role = { _id: 'r3', name: 'Superadministrador', active: true, createdAt: new Date(), updatedAt: new Date() };
      service.setUser(makeUser({ role }));
      expect(service.isAnyAdmin()).toBeTrue();
    });

    it('isAnyAdmin() returns false for Colaborador', () => {
      service.setUser(makeUser());
      expect(service.isAnyAdmin()).toBeFalse();
    });
  });

  describe('permissions', () => {
    it('getPermissions() returns user permissions when set', () => {
      service.setUser(makeUser({ permissions: { modules: ['tesoreria'], canApproveL1: true, canApproveL2: false } }));
      expect(service.getPermissions()).toEqual({ modules: ['tesoreria'], canApproveL1: true, canApproveL2: false });
    });

    it('getPermissions() returns defaults when permissions is undefined', () => {
      service.setUser(makeUser({ permissions: undefined }));
      expect(service.getPermissions()).toEqual({ modules: [], canApproveL1: false, canApproveL2: false });
    });

    it('hasModulePermission() returns true for Administrador regardless of modules', () => {
      const role = { _id: 'r2', name: 'Administrador', active: true, createdAt: new Date(), updatedAt: new Date() };
      service.setUser(makeUser({ role, permissions: { modules: [], canApproveL1: false, canApproveL2: false } }));
      expect(service.hasModulePermission('tesoreria')).toBeTrue();
    });

    it('hasModulePermission() returns true for Superadministrador regardless of modules', () => {
      const role = { _id: 'r3', name: 'Superadministrador', active: true, createdAt: new Date(), updatedAt: new Date() };
      service.setUser(makeUser({ role }));
      expect(service.hasModulePermission('any-module')).toBeTrue();
    });

    it('hasModulePermission() returns true when Colaborador has the module', () => {
      service.setUser(makeUser({ permissions: { modules: ['tesoreria'], canApproveL1: false, canApproveL2: false } }));
      expect(service.hasModulePermission('tesoreria')).toBeTrue();
    });

    it('hasModulePermission() returns false when Colaborador does not have the module', () => {
      service.setUser(makeUser({ permissions: { modules: ['invoice-approval'], canApproveL1: false, canApproveL2: false } }));
      expect(service.hasModulePermission('tesoreria')).toBeFalse();
    });

    it('canApproveL1() returns true when canApproveL1 permission is true', () => {
      service.setUser(makeUser({ permissions: { modules: [], canApproveL1: true, canApproveL2: false } }));
      expect(service.canApproveL1()).toBeTrue();
    });

    it('canApproveL1() returns true for Superadministrador', () => {
      const role = { _id: 'r3', name: 'Superadministrador', active: true, createdAt: new Date(), updatedAt: new Date() };
      service.setUser(makeUser({ role, permissions: { modules: [], canApproveL1: false, canApproveL2: false } }));
      expect(service.canApproveL1()).toBeTrue();
    });

    it('canApproveL1() returns false when permission is false and not super', () => {
      service.setUser(makeUser({ permissions: { modules: [], canApproveL1: false, canApproveL2: false } }));
      expect(service.canApproveL1()).toBeFalse();
    });

    it('canApproveL2() returns true when canApproveL2 permission is true', () => {
      service.setUser(makeUser({ permissions: { modules: [], canApproveL1: false, canApproveL2: true } }));
      expect(service.canApproveL2()).toBeTrue();
    });

    it('canApproveL2() returns true for Superadministrador', () => {
      const role = { _id: 'r3', name: 'Superadministrador', active: true, createdAt: new Date(), updatedAt: new Date() };
      service.setUser(makeUser({ role }));
      expect(service.canApproveL2()).toBeTrue();
    });

    it('canApproveL2() returns false when permission is false and not super', () => {
      service.setUser(makeUser({ permissions: { modules: [], canApproveL1: false, canApproveL2: false } }));
      expect(service.canApproveL2()).toBeFalse();
    });

    it('canAccessTesoreria() returns true for Superadministrador', () => {
      const role = { _id: 'r3', name: 'Superadministrador', active: true, createdAt: new Date(), updatedAt: new Date() };
      service.setUser(makeUser({ role }));
      expect(service.canAccessTesoreria()).toBeTrue();
    });

    it('canAccessTesoreria() returns true when tesoreria module is granted', () => {
      service.setUser(makeUser({ permissions: { modules: ['tesoreria'], canApproveL1: false, canApproveL2: false } }));
      expect(service.canAccessTesoreria()).toBeTrue();
    });

    it('canAccessTesoreria() returns false when tesoreria module is not granted', () => {
      service.setUser(makeUser({ permissions: { modules: [], canApproveL1: false, canApproveL2: false } }));
      expect(service.canAccessTesoreria()).toBeFalse();
    });
  });
});

describe('UserStateService — pre-populated localStorage', () => {
  const storedUser: Partial<IUserResponse> = {
    _id: 'stored-u1',
    name: 'Stored User',
    email: 'stored@test.com',
    isActive: true,
    access_token: 'stored-token',
    companyId: 'company1',
    role: { _id: 'r1', name: 'Administrador', active: true, createdAt: new Date(), updatedAt: new Date() },
    permissions: { modules: ['tesoreria'], canApproveL1: true, canApproveL2: false },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(USER_LOCALSTORAGE_KEY, JSON.stringify(storedUser));
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
  });

  afterEach(() => localStorage.clear());

  it('should load user from localStorage on construction', () => {
    const service = TestBed.inject(UserStateService);
    expect(service.getUser()?._id).toBe('stored-u1');
  });

  it('should be authenticated when token and user are in localStorage', () => {
    const service = TestBed.inject(UserStateService);
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('should return the access_token from the loaded user', () => {
    const service = TestBed.inject(UserStateService);
    expect(service.getToken()).toBe('stored-token');
  });

  it('should reflect role from stored user', () => {
    const service = TestBed.inject(UserStateService);
    expect(service.isAdmin()).toBeTrue();
  });

  it('should infer companyId from clientId._id when companyId is missing', () => {
    localStorage.clear();
    const userWithoutCompanyId = { ...storedUser, companyId: undefined, clientId: { _id: 'inferred-company' } };
    localStorage.setItem(USER_LOCALSTORAGE_KEY, JSON.stringify(userWithoutCompanyId));
    const service = TestBed.inject(UserStateService);
    expect(service.getUser()?.companyId).toBe('inferred-company');
  });
});
