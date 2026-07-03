import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { IAccountingConfig } from '../interfaces/accounting-config.interface';

@Injectable({ providedIn: 'root' })
export class AccountingConfigService {
  private http = inject(HttpClient);
  private url = `${environment.api}/accounting-config`;

  /** Devuelve la config contable de la empresa o null si no existe. */
  getConfig(clientId: string): Observable<IAccountingConfig | null> {
    return this.http.get<IAccountingConfig | null>(`${this.url}/${clientId}`);
  }

  /** Upsert de la configuración contable (plan de cuentas + bancos). */
  saveConfig(
    clientId: string,
    config: Partial<IAccountingConfig>
  ): Observable<IAccountingConfig> {
    return this.http.put<IAccountingConfig>(`${this.url}/${clientId}`, config);
  }
}