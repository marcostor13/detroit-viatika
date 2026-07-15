import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { ICompanyConfig } from '../interfaces/company-config.interface';
import { InvoicesService } from '../modules/invoices/services/invoices.service';
import { UserStateService } from './user-state.service';
import { UploadService } from './upload.service';

interface UploadProgress {
  config?: ICompanyConfig;
  progress?: number;
  type: 'progress' | 'complete' | 'error';
}

@Injectable({
  providedIn: 'root',
})
export class CompanyConfigService {
  private invoicesService = inject(InvoicesService);
  private userStateService = inject(UserStateService);
  private uploadService = inject(UploadService);

  private companyConfigSubject = new BehaviorSubject<ICompanyConfig | null>(
    null
  );
  public companyConfig$ = this.companyConfigSubject.asObservable();

  constructor() {
    this.initCompanyConfig();
  }

  initCompanyConfig() {
    const user = this.userStateService.getUser();
    const clientId = user?.client?._id || (user as any)?.companyId || '';

    const defaultConfig: ICompanyConfig = {
      _id: clientId,
      companyId: clientId,
      name: 'Tema Litoclean',
      businessName: 'Tema Litoclean',
      logo: '',
    };
    this.setCompanyConfig(defaultConfig);
  }

  setCompanyConfig(config: ICompanyConfig) {
    this.companyConfigSubject.next(config);
  }

  private loadCompanyConfig() {
    // Solo hacer la llamada si hay usuario autenticado
    if (!this.userStateService.isAuthenticated()) {
      return;
    }

    // Verificar si el usuario es admin antes de hacer la llamada
    const user = this.userStateService.getUser();
    const isAdmin = this.userStateService.isAdmin() || this.userStateService.isSuperAdmin() || this.userStateService.isContabilidad();

    if (!isAdmin) {
      return;
    }

    const companyId = user?.companyId || user?.client?._id || '';
    if (!companyId) return;

    this.invoicesService
      .getCompanyConfig(companyId)
      .subscribe({
        next: (config: ICompanyConfig) => {
          this.companyConfigSubject.next(config);
        },
        error: (error) => {
          // Manejar error 403 silenciosamente (usuario sin permisos)
          // o cualquier otro error sin romper la aplicación
          if (error.status !== 403) {
            console.error('Error al cargar configuración de compañía:', error);
          }
          // Mantener la configuración por defecto si hay error
        }
      });
  }

  getCompanyConfig(): ICompanyConfig | null {
    return this.companyConfigSubject.value;
  }

  updateCompanyName(name: string): Observable<ICompanyConfig> {
    const companyId = this.companyConfigSubject.value?._id || this.companyConfigSubject.value?.companyId;
    if (!companyId) throw new Error('No se encontró companyId');

    return new Observable((observer) => {
      this.invoicesService
        .updateCompanyConfig(companyId, {
          name,
          businessName: name,
        })
        .subscribe((config) => {
          this.companyConfigSubject.next(config);
          observer.next(config);
          observer.complete();
        });
    });
  }

  uploadCompanyLogo(file: File, _id: string): Observable<UploadProgress> {
    const clientId = this.companyConfigSubject.value?._id;
    const cid = this.companyConfigSubject.value?._id || this.companyConfigSubject.value?.companyId;

    if (!cid) {
      return new Observable((observer) => {
        observer.next({ type: 'error' });
        observer.error(new Error('No companyId'));
      });
    }

    const path = `company-logos/${clientId ?? cid}`;
    const { uploadProgress$, downloadUrl$ } = this.uploadService.uploadFile(file, path);

    return new Observable<UploadProgress>((observer) => {
      const subs: Subscription[] = [];
      const progressSub = uploadProgress$.subscribe((progress) => {
        observer.next({ progress, type: 'progress' });
      });
      subs.push(progressSub);

      const urlSub = downloadUrl$.subscribe({
        next: (url) => {
          subs.forEach((s) => s.unsubscribe());
          this.invoicesService
            .updateCompanyConfig(cid, { logo: url })
            .subscribe({
              next: (config) => {
                this.companyConfigSubject.next(config);
                observer.next({ config, progress: 100, type: 'complete' });
                observer.complete();
              },
              error: (err) => {
                observer.next({ type: 'error' });
                observer.error(err);
              },
            });
        },
        error: (err) => {
          subs.forEach((s) => s.unsubscribe());
          observer.next({ type: 'error' });
          observer.error(err);
        },
      });
      subs.push(urlSub);

      return () => subs.forEach((s) => s.unsubscribe());
    });
  }

  updatePaymentAccount(companyId: string, paymentAccount: string): Observable<ICompanyConfig> {
    return new Observable((observer) => {
      this.invoicesService
        .updateCompanyConfig(companyId, { paymentAccount })
        .subscribe({
          next: (config) => {
            this.companyConfigSubject.next(config);
            observer.next(config);
            observer.complete();
          },
          error: (err) => {
            observer.error(err);
          },
        });
    });
  }

  updateLimits(companyId: string, limits: { movilidadDiario?: number }): Observable<ICompanyConfig> {
    return new Observable((observer) => {
      this.invoicesService
        .updateCompanyConfig(companyId, { limits })
        .subscribe({
          next: (config) => {
            this.companyConfigSubject.next(config);
            observer.next(config);
            observer.complete();
          },
          error: (err) => {
            observer.error(err);
          },
        });
    });
  }

  refreshConfig() {
    this.loadCompanyConfig();
  }

  // Método para recargar configuración cuando el usuario se autentique
  reloadConfigOnAuth() {
    this.initCompanyConfig();
    this.loadCompanyConfig();
  }
}
