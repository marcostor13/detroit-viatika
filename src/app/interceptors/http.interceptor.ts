import { HttpInterceptorFn } from '@angular/common/http';
import { UserStateService } from '../services/user-state.service';
import { inject } from '@angular/core';
import { LoaderService } from '../services/loader.service';
import { finalize } from 'rxjs';

/** Evita enviar Bearer con JWT caduco o ilegible (Passport devuelve 401 igual que sin cabecera). */
function isJwtExpiredOrInvalid(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) base64 += '='.repeat(4 - pad);
    const payload = JSON.parse(atob(base64));
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export const httpInterceptor: HttpInterceptorFn = (req, next) => {
  const userStateService = inject(UserStateService);
  const loaderService = inject(LoaderService);
  loaderService.show();
  let user = userStateService.getUser();
  let token = user?.access_token || userStateService.getToken() || null;
  if (token && isJwtExpiredOrInvalid(token)) {
    userStateService.clearUser();
    user = null;
    token = null;
  }
  const currentHeaders = req.headers;
  const objectHeaders = Object.fromEntries(
    currentHeaders.keys().map((key) => [key, currentHeaders.get(key)])
  );
  let url = req.url;

  const excludedEndpoints = ['/auth', '/auth/', '/login'];
  const skipCompanyIdEndpoints = [
    '/approve',
    '/reject',
    '/user',
    '/user/',
    '/client',
    '/client/',
    '/sunat-config',
    '/sunat-config/',
    '/config',
    '/logo',
    '/api/client',
    '/expense-report',
    '/advance',
    '/role',
    '/role/',
    '/audit-log',
    '/notifications',
    '/notifications/',
    '/bulk-import',
  ];

  const isExcludedEndpoint = excludedEndpoints.some(
    (endpoint) => url.includes(endpoint) || url.endsWith('/api')
  );
  const shouldSkipCompanyId = skipCompanyIdEndpoints.some((endpoint) =>
    url.includes(endpoint)
  );

  if (token != null && token !== '') {
    const headers: any = {
      ...objectHeaders,
      Authorization: `Bearer ${token}`,
    };

    // No establecer Content-Type para FormData (subida de archivos)
    if (!(req.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    req = req.clone({
      setHeaders: headers,
    });
  }

  if (req.url.includes('with-super-admin')) {
    return next(req).pipe(finalize(() => loaderService.hide()));
  }

  const companyId = user?.companyId;

  // Append companyId to GET requests if not superAdmin and not excluded
  if (req.method === 'GET' && companyId && !userStateService.isSuperAdmin() && !shouldSkipCompanyId) {
    const shouldAddClientId =
      !req.url.includes('/expense/') ||
      req.url.includes('/expense/client/') ||
      req.url.includes('/expense/test-sunat-credentials/');

    // Evita duplicar clientId en rutas que ya lo incluyen explícitamente (ej: /category/:clientId/flat).
    const alreadyContainsClientIdInPath =
      req.url.includes(`/category/${companyId}`) ||
      req.url.includes(`/project/${companyId}`) ||
      req.url.includes(`/expense-report/user/`) ||
      req.url.includes(`/user/client/${companyId}`);

    if (shouldAddClientId && !req.url.endsWith(companyId) && !alreadyContainsClientIdInPath) {
       // Only append if it's not already there
       req = req.clone({ url: `${req.url}/${companyId}` });
    }
  }

  // Handle DELETE/PATCH for categories/projects
  if ((req.method === 'DELETE' || req.method === 'PATCH') && companyId) {
    if ((req.url.includes('/category/') || req.url.includes('/project/')) && !req.url.endsWith(companyId)) {
      req = req.clone({ url: `${req.url}/${companyId}` });
    }
  }

  // Add clientId to POST requests
  if (req.method === 'POST' && companyId && !isExcludedEndpoint && !shouldSkipCompanyId) {
    if (req.body instanceof FormData) {
      if (!req.body.has('clientId')) req.body.append('clientId', companyId);
    } else {
      const body = req.body || {};
      req = req.clone({
        body: {
          ...body,
          clientId: companyId,
        },
      });
    }
  }

  return next(req).pipe(finalize(() => loaderService.hide()));
};
