import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type AsientoTipo =
  | 'solicitud'
  | 'compra'
  | 'aplicacion'
  | 'devolucion'
  | 'reembolso';

export interface ICuadreError {
  relacionado: number;
  totalDebe: number;
  totalHaber: number;
  diferencia: number;
}

export interface IGeneratedFile {
  filename: string;
  base64: string;
  tipo: AsientoTipo;
  asientosCount: number;
  cuadreErrors: ICuadreError[];
}

@Injectable({ providedIn: 'root' })
export class AccountingEntriesService {
  private http = inject(HttpClient);
  private url = `${environment.api}/accounting-entries`;

  generate(
    reportId: string,
    tipos?: AsientoTipo[]
  ): Observable<{ files: IGeneratedFile[] }> {
    let params = new HttpParams();
    if (tipos?.length) params = params.set('tipos', tipos.join(','));
    const fullUrl = `${this.url}/${reportId}?tipos=${tipos?.join(',') ?? ''}`;
    const t0 = Date.now();
    console.log('[asientos] REQUEST →', fullUrl);
    return this.http.get<{ files: IGeneratedFile[] }>(`${this.url}/${reportId}`, { params }).pipe(
      tap({
        next: (res) => console.log(`[asientos] RESPONSE OK — ${((Date.now() - t0) / 1000).toFixed(1)}s — ${res?.files?.length ?? 0} archivo(s)`),
        error: (err) => console.error(`[asientos] RESPONSE ERROR — ${((Date.now() - t0) / 1000).toFixed(1)}s — status=${err?.status}`, err),
      })
    );
  }

  clearCache(reportId: string): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(`${this.url}/cache/${reportId}`);
  }

  downloadBase64(file: IGeneratedFile): void {
    const bytes = atob(file.base64);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
